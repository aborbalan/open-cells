/**
 * Conventional Commits, enforced on the way in.
 *
 * `@commitlint/cli` and `@commitlint/config-conventional` had been devDependencies for a long
 * time with nothing configured to read them and no hook to run them, so CONTRIBUTING.md
 * described a rule that was never checked. This is that configuration.
 *
 * The scope is the package name, as CONTRIBUTING.md asks: `fix(core): ...`.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The generated bodies in this repository explain the why at length; 100 characters is
    // too short for a useful paragraph and reflowing them adds nothing.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};
