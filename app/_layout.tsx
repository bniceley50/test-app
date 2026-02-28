import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { getDatabase, seedQuestions, seedCodeSections, getQuestionCount } from '@/lib/database';
import { seedQuestions as questionData } from '@/data/questions';
import { seedCodeSections as codeSectionData } from '@/data/code-sections';

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
        <Stack.Screen name="mock" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="results" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </>
  );
}
