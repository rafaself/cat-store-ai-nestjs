export interface DemoCustomer {
  id: string;
}

export interface DemoAuthenticatedRequest {
  headers: { authorization?: string | string[] };
  user?: DemoCustomer;
}
