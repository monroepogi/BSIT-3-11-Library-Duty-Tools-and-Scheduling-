/**
 * Cross-platform Angular CLI launcher.
 * Sets NG_BUILD_SASS_EMBEDDED=0 by default so pure-JS Dart Sass (`sass`) is used,
 * avoiding Windows junction canonicalization errors inside restricted sandboxes.
 */
process.env.NG_BUILD_SASS_EMBEDDED ??= '0';
await import('../node_modules/@angular/cli/bin/ng.js');
