import { FakeModel, overrideModels } from '@nestjs/ai/testing';
import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EMAIL_QUEUE } from '@cat-supplies-store/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule as ApiModule } from '../src/app.module';
import { AppModule as WorkerModule } from '../../agent-worker/src/app.module';
import { MailpitService } from '../../agent-worker/src/apps/email/mailpit.service';

const mailpitUrl = process.env.MAILPIT_URL ?? 'http://127.0.0.1:18025';
const supportToken = 'test-support-token';

describe('email jobs (e2e)', () => {
  let app: INestApplication;
  let worker: TestingModule | undefined;
  let messageId: string;
  let jobId: string;

  beforeAll(async () => {
    const response = await fetch(`${mailpitUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Name: 'Pat', Email: 'pat@example.test' },
        To: [{ Email: 'support@example.test' }],
        Subject: 'Damaged order',
        Text: 'My order ord_123 arrived damaged.',
      }),
    });
    if (!response.ok)
      throw new Error(`Mailpit setup failed: ${response.status}`);
    messageId = ((await response.json()) as { ID: string }).ID;
    const builder = Test.createTestingModule({ imports: [ApiModule] });
    const fixture = await builder.compile();
    app = fixture.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (worker) await worker.close();
    if (app) {
      if (jobId) {
        await app
          .get(DataSource)
          .query('DELETE FROM email_drafts WHERE job_id = $1', [jobId]);
        const queue = app.get<Queue>(getQueueToken(EMAIL_QUEUE));
        const job = await queue.getJob(jobId);
        if (job) await job.remove();
      }
      await app.close();
    }
    if (messageId) {
      await fetch(`${mailpitUrl}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: [messageId] }),
      });
    }
  }, 30_000);

  it('authorizes, retries, and deduplicates a job queued before worker startup', async () => {
    await request(app.getHttpServer())
      .post('/email-jobs')
      .send({ messageId })
      .expect(401);
    await request(app.getHttpServer())
      .post('/email-jobs')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ messageId: 'latest' })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post('/email-jobs')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ messageId })
      .expect(201);
    jobId = created.body.jobId as string;
    const duplicate = await request(app.getHttpServer())
      .post('/email-jobs')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ messageId })
      .expect(201);
    expect(duplicate.body.jobId).toBe(jobId);
    await request(app.getHttpServer()).get(`/email-jobs/${jobId}`).expect(401);
    await request(app.getHttpServer())
      .get(`/email-jobs/${jobId}`)
      .set('Authorization', 'Bearer test-customer-token')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/email-jobs/${'0'.repeat(64)}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(404);
    const queue = app.get<Queue>(getQueueToken(EMAIL_QUEUE));
    expect((await queue.getJob(jobId))?.data).toEqual({
      messageId,
      requesterId: 'demo-support',
    });
    const pending = await request(app.getHttpServer())
      .get(`/email-jobs/${jobId}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
    expect(pending.body.status).toBe('pending');

    const model = new FakeModel([
      {
        object: {
          category: 'order',
          orderId: 'ord_123',
          urgent: true,
          summary: 'Order arrived damaged.',
        },
      },
      { text: 'Sorry your order arrived damaged. We can help.' },
    ]);
    const workerBuilder = Test.createTestingModule({ imports: [WorkerModule] });
    worker = await overrideModels(workerBuilder, { default: model }).compile();
    const mailpit = worker.get(MailpitService);
    const realRead = mailpit.read.bind(mailpit);
    const read = vi
      .spyOn(mailpit, 'read')
      .mockRejectedValueOnce(new Error('Sensitive provider response'))
      .mockImplementation(realRead);
    await worker.init();

    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await (await queue.getJob(jobId))?.getState()) === 'delayed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(read).toHaveBeenCalledTimes(1);
    expect(await (await queue.getJob(jobId))?.getState()).toBe('delayed');
    expect((await queue.getJob(jobId))?.failedReason).toBe(
      'Email job processing failed.',
    );
    await worker.close();
    worker = undefined;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const restartedBuilder = Test.createTestingModule({
      imports: [WorkerModule],
    });
    worker = await overrideModels(restartedBuilder, {
      default: model,
    }).compile();
    const restartedRead = vi.spyOn(worker.get(MailpitService), 'read');
    await worker.init();

    let result: request.Response | undefined;
    for (let attempt = 0; attempt < 150; attempt++) {
      result = await request(app.getHttpServer())
        .get(`/email-jobs/${jobId}`)
        .set('Authorization', `Bearer ${supportToken}`);
      if (result.body.status === 'completed' || result.body.status === 'failed')
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(result?.body).toMatchObject({
      jobId,
      status: 'completed',
      result: {
        subject: 'Damaged order',
        sender: 'pat@example.test',
        classification: { category: 'order' },
        draft: expect.stringContaining('Sorry'),
      },
    });
    expect(restartedRead).toHaveBeenCalledTimes(1);
    expect(model.calls).toHaveLength(2);
    await worker.close();
    worker = undefined;
    await (await queue.getJob(jobId))?.remove();
    const stored = await request(app.getHttpServer())
      .get(`/email-jobs/${jobId}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
    expect(stored.body.status).toBe('completed');
    const repeated = await request(app.getHttpServer())
      .post('/email-jobs')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ messageId })
      .expect(201);
    expect(repeated.body.jobId).toBe(jobId);
    expect(await queue.getJob(jobId)).toBeUndefined();
    const rows = await app
      .get(DataSource)
      .query(
        'SELECT count(*)::int AS count FROM email_drafts WHERE job_id = $1',
        [jobId],
      );
    expect(rows[0].count).toBe(1);
  }, 30_000);
});
