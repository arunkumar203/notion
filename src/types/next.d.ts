import 'next';

declare module 'next' {
  interface NextRequest {
    cookies: {
      get: (name: string) => { value: string } | undefined;
    };
  }
}
