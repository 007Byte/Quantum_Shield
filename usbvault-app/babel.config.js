module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/app',
            '@services': './src/services',
            '@stores': './src/stores',
            '@utils': './src/utils',
            '@theme': './src/theme',
            '@crypto': './src/crypto',
          },
        },
      ],
    ],
  };
};
