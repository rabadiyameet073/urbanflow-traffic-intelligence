/**
 * Module 21 §2: Tiny path matcher without external dependencies.
 *
 * `match` additionally reports every method registered for a matching path so
 * the gateway can answer `405 METHOD_NOT_ALLOWED` (Module 22 §2.1) instead of
 * pretending an existing route does not exist.
 */

export interface PathMatch {
  params: Record<string, string>;
  /** Methods registered for this path, in declaration order. */
  methods: string[];
}

export interface RouteMatch {
  params: Record<string, string>;
  handler: (req: Request, params: Record<string, string>) => Promise<Response>;
}

export interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: (req: Request, params: Record<string, string>) => Promise<Response>;
}

export class Router {
  private routes: Route[] = [];

  public add(
    method: string,
    pathPattern: string,
    handler: (req: Request, params: Record<string, string>) => Promise<Response>,
  ): void {
    const paramNames: string[] = [];
    const regexStr = pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${escapeRegex(regexStr)}$`),
      paramNames,
      handler,
    });
  }

  /** Path-only lookup used to distinguish `404` from `405`. */
  public matchPath(pathname: string): PathMatch | null {
    let params: Record<string, string> | null = null;
    const methods: string[] = [];

    for (const route of this.routes) {
      const match = pathname.match(route.pattern);
      if (!match) continue;
      methods.push(route.method);
      if (params === null) {
        params = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]!] = decodeURIComponent(match[i + 1]!);
        }
      }
    }

    return params === null ? null : { params, methods };
  }

  public match(method: string, pathname: string): RouteMatch | null {
    const m = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== m) continue;
      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]!] = decodeURIComponent(match[i + 1]!);
        }
        return { params, handler: route.handler };
      }
    }
    return null;
  }
}

/**
 * Escapes every regex metacharacter *except* the capture groups this module
 * injects for `:param` segments, so a path can never be used as a regex.
 */
function escapeRegex(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '(' && pattern.startsWith('([^/]+)', i)) {
      out += '([^/]+)';
      i += '([^/]+)'.length - 1;
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  }
  return out;
}
