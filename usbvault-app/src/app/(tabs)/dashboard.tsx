import { Platform, ScrollView, StyleSheet, View, Dimensions } from 'react-native';
import { useEffect, useState } from 'react';

import { HeroSection } from '@/components/dashboard2/HeroSection';
import { RightRail } from '@/components/dashboard2/RightRail';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { MobileDashboard } from '@/components/dashboard2/MobileDashboard';
import {
  dashboardLayout,
  dashboardSpacing,
} from '@/components/dashboard2/styles';
import { TopBar } from '@/components/dashboard2/TopBar';
import { VaultTable } from '@/components/dashboard2/vault-table';
import { Footer } from '@/components/dashboard2/Footer';
import { webOnly } from '@/utils/webStyle';

export default function DashboardScreen() {
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });

    return () => subscription?.remove();
  }, []);

  // On mobile or narrow screens, show mobile dashboard
  const isMobile = Platform.OS !== 'web' || screenWidth < 768;

  if (isMobile) {
    return <MobileDashboard />;
  }

  return (
      <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentRow}>
              <View style={styles.centerCol}>
                <HeroSection />
                <VaultTable />
              </View>

              <RightRail />
            </View>

            <Footer />
          </View>
        </View>
      </ScrollView>
      </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -170,
    left: '18%',
    width: 860,
    height: 580,
    borderRadius: 380,
    backgroundColor: 'rgba(139,92,246,0.14)',
    ...webOnly({ filter: 'blur(132px)' }),
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -190,
    left: -20,
    width: 920,
    height: 460,
    borderRadius: 430,
    backgroundColor: 'rgba(168,85,247,0.1)',
    ...webOnly({ filter: 'blur(106px)' }),
  },
  bgGlowRight: {
    position: 'absolute',
    top: 20,
    right: -150,
    width: 700,
    height: 700,
    borderRadius: 280,
    backgroundColor: 'rgba(34,211,238,0.11)',
    ...webOnly({ filter: 'blur(124px)' }),
  },
  bgNebula: {
    position: 'absolute',
    right: '22%',
    bottom: 30,
    width: 560,
    height: 240,
    borderRadius: 220,
    backgroundColor: 'rgba(96,165,250,0.08)',
    ...webOnly({ filter: 'blur(88px)' }),
  },
  bgCenterBloom: {
    position: 'absolute',
    top: 200,
    left: '30%',
    width: 620,
    height: 250,
    borderRadius: 240,
    ...webOnly({
      background: 'linear-gradient(145deg, rgba(139,92,246,0.12), rgba(34,211,238,0.06))',
      filter: 'blur(74px)',
    }),
  },
  bgLightSpill: {
    position: 'absolute',
    top: 300,
    left: '20%',
    width: 820,
    height: 80,
    borderRadius: 40,
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(139,92,246,0.12) 0%, rgba(34,211,238,0.1) 45%, rgba(168,85,247,0.1) 100%)',
      filter: 'blur(34px)',
    }),
    opacity: 0.44,
  },
  bgFloorGlow: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 18,
    height: 8,
    borderRadius: 20,
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(217,70,239,0.32) 0%, rgba(34,211,238,0.28) 55%, rgba(139,92,246,0.26) 100%)',
      filter: 'blur(12px)',
    }),
    opacity: 0.55,
  },
  bgEnergyBandOne: {
    position: 'absolute',
    left: '18%',
    top: 330,
    width: 860,
    height: 26,
    borderRadius: 20,
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(168,85,247,0.0), rgba(168,85,247,0.24), rgba(34,211,238,0.2), rgba(168,85,247,0.0))',
      filter: 'blur(18px)',
    }),
    opacity: 0.36,
  },
  bgEnergyBandTwo: {
    position: 'absolute',
    left: '10%',
    bottom: 62,
    width: 1120,
    height: 20,
    borderRadius: 18,
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(34,211,238,0), rgba(34,211,238,0.18), rgba(168,85,247,0.2), rgba(34,211,238,0))',
      filter: 'blur(14px)',
    }),
    opacity: 0.3,
  },
  bgVignette: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...webOnly({
      background:
        'radial-gradient(circle at 50% 50%, rgba(7,4,18,0) 46%, rgba(7,4,18,0.18) 76%, rgba(7,4,18,0.34) 100%)',
    }),
    pointerEvents: 'none',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    // Keep the frame content-driven so we don't get forced empty vertical space.
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    minWidth: 0,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  centerCol: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingRight: 10,
    paddingBottom: 0,
  },
});
