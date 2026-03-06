declare module "dockerode" {
  export default class Docker {
    ping(): Promise<void>;
    createContainer(config: unknown): Promise<{
      id: string;
      start(): Promise<void>;
      stop(options?: unknown): Promise<void>;
      remove(options?: unknown): Promise<void>;
      inspect(): Promise<{
        Id: string;
        Name: string;
        State: {
          Status: string;
          ExitCode?: number;
          StartedAt?: string;
          FinishedAt?: string;
        };
      }>;
      exec(options: unknown): Promise<{
        start(
          options: unknown,
          callback: (
            err: Error | null,
            stream?: NodeJS.ReadableStream & NodeJS.WritableStream,
          ) => void,
        ): void;
      }>;
    }>;
    getContainer(id: string): {
      start(): Promise<void>;
      stop(options?: unknown): Promise<void>;
      remove(options?: unknown): Promise<void>;
      inspect(): Promise<{
        Id: string;
        Name: string;
        State: {
          Status: string;
          ExitCode?: number;
          StartedAt?: string;
          FinishedAt?: string;
        };
      }>;
      exec(options: unknown): Promise<{
        start(
          options: unknown,
          callback: (
            err: Error | null,
            stream?: NodeJS.ReadableStream & NodeJS.WritableStream,
          ) => void,
        ): void;
      }>;
    };
  }
}
