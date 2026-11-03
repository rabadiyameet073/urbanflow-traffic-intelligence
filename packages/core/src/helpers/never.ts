/**
 * Module 50 §2: the exhaustive-`switch` guard.
 *
 * Place it in the `default:` arm of a discriminated-union switch. If every
 * variant is handled, the parameter's inferred type is `never` and this
 * compiles; the day a variant is added to the union without a matching arm,
 * `tsc` stops compiling — which is the point. The throw is the runtime
 * belt-and-braces for values that reached here through `unknown` input that
 * bypassed a schema boundary; silent fall-through is the alternative and it is
 * worse (Rule 06: never fail quietly).
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
