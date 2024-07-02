module.exports = {
  printWidth: 100,
  semi: true,
  singleQuote: true,
  overrides: [
    {
      files: ['**/*.css', '**/*.scss', '**/*.html'],
      options: {
        singleQuote: false,
      },
    },
  ],
  singleAttributePerLine: false,
};
