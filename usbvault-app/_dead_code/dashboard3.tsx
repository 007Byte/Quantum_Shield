// DEPRECATED — V2 is now the primary dashboard at dashboard.tsx
// This file can be safely deleted.
import React from 'react';
import { Text, View } from 'react-native';

export default function Dashboard3Redirect() {
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff' }}>Moved to Dashboard</Text>
    </View>
  );
}
