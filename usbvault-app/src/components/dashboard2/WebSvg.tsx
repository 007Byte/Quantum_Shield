import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface WebSvgProps {
  svg: string;
  style?: StyleProp<ViewStyle>;
  fallbackColor?: string;
}

// Available for future use
export function WebSvg({ svg, style, fallbackColor = 'rgba(168,85,247,0.22)' }: WebSvgProps) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const width = (flatStyle as ViewStyle).width ?? '100%';
  const height = (flatStyle as ViewStyle).height ?? '100%';
  const compactSvg = svg.replace(/\n/g, '').trim();
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(compactSvg)}`;

  return (
    <View style={[{ backgroundColor: fallbackColor, overflow: 'hidden' }, style]}>
      <Image
        source={{ uri }}
        style={{ width: width as any, height: height as any }}
        resizeMode="contain"
      />
    </View>
  );
}
