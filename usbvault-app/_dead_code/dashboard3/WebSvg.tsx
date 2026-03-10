import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

interface WebSvgProps {
  svg: string;
  style?: StyleProp<ViewStyle>;
  fallbackColor?: string;
}

export function WebSvg({ svg, style, fallbackColor = 'rgba(168,85,247,0.22)' }: WebSvgProps) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const width = (flatStyle as ViewStyle).width ?? '100%';
  const height = (flatStyle as ViewStyle).height ?? '100%';
  const containerStyle: ViewStyle = {
    backgroundColor: fallbackColor,
    overflow: 'hidden',
  };

  return (
    <View style={[containerStyle, style]}>
      <SvgXml xml={svg} width={width as any} height={height as any} />
    </View>
  );
}
