import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠',
    Topics: '📊',
    Bookmarks: '⭐',
    Code: '📖',
  };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22 }}>{icons[name] || '📋'}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a4e',
          height: 85,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#4fc3f7',
        tabBarInactiveTintColor: '#666',
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'KY Plumber Prep',
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="topics"
        options={{
          title: 'Topics',
          headerTitle: 'Topic Breakdown',
          tabBarIcon: ({ focused }) => <TabIcon name="Topics" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: 'Bookmarks',
          headerTitle: 'Bookmarks',
          tabBarIcon: ({ focused }) => <TabIcon name="Bookmarks" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="code"
        options={{
          title: 'Code',
          headerTitle: 'Code Reference',
          tabBarIcon: ({ focused }) => <TabIcon name="Code" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
