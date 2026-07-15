declare module 'lighthouse' {
  export interface LighthouseFlags {
    port?: number;
    output?: Array<'json' | 'html'>;
    logLevel?: 'silent' | 'error' | 'info' | 'verbose';
    screenEmulation?: Record<string, unknown>;
  }

  export interface LighthouseSettings {
    formFactor?: 'desktop' | 'mobile';
    screenEmulation?: Record<string, unknown>;
    emulatedUserAgent?: string | boolean;
    throttling?: Record<string, unknown>;
    throttlingMethod?: string;
    onlyCategories?: string[];
  }

  export interface LighthouseConfig {
    extends?: string;
    settings?: LighthouseSettings;
  }

  export interface LighthouseAuditResult {
    displayValue?: string;
  }

  export interface LighthouseCategory {
    score?: number | null;
  }

  export interface LighthouseRunResult {
    lhr: {
      categories: Record<string, LighthouseCategory> & {
        performance?: LighthouseCategory;
      };
      audits: Record<string, LighthouseAuditResult>;
    };
    report: string | string[];
  }

  function lighthouse(
    url: string,
    flags?: LighthouseFlags,
    config?: LighthouseConfig
  ): Promise<LighthouseRunResult>;

  export default lighthouse;
}

declare module 'chrome-launcher' {
  export interface LaunchOptions {
    chromeFlags?: string[];
    port?: number;
    chromePath?: string;
  }

  export interface LaunchedChrome {
    port: number;
    kill: () => Promise<void>;
  }

  export function launch(options?: LaunchOptions): Promise<LaunchedChrome>;
}
