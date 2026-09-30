// Node resolve hook for checks: the app imports its modules without extensions, Node wants '.ts'.
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(spec) && !/\.[a-z]+$/i.test(spec)) return next(spec + '.ts', ctx);
    throw e;
  }
}
