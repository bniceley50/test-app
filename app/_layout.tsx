import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { getDatabase, closeDatabase, seedQuestions, seedCodeSections, getQuestionCount } from '@/lib/database';

const questionData = require('@/data/questions.seed.json');
const codeSectionData = require('@/data/code_sections.seed.json');

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await getDatabase();
        await seedQuestions(questionData);
        await seedCodeSections(codeSectionData);
        const count = await getQuestionCount();
        console.log(`Database ready with ${count} questions`);
      } catch (e) {
        console.error('Database init error:', e);
      } finally {
        setReady(true);
        SplashScreen.hideAsync();
      }
    }
    init();
  }, []);

  // Web only: on a full-page navigation (deep link, reload, leaving the site)
  // release this document's OPFS pool handles NOW instead of leaving them
  // locked until Chrome GCs the dying worker — that was the source of the
  // "Invalid VFS state" dead-end on hard navigation to any route.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onHide = () => {
      closeDatabase().catch((e) => console.warn('closeDatabase on pagehide:', e));
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#16213e' },
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="drill" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="missed" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="results" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </>
  );
}
