/**
 * Tiny path matcher without external dependencies
 */

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
    const regexStr = pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
    });
  }

  public match(method: string, pathname: string): RouteMatch | null {
    const m = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== m) continue;
      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]!] = match[i + 1]!;
        }
        return { params, handler: route.handler };
      }
    }
    return null;
  }
}
