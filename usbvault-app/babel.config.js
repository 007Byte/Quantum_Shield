module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
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
      // Must be last: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#step-2-add-reanimateds-babel-plugin
      'react-native-reanimated/plugin',
    ],
  };
};
