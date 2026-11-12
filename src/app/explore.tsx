import { router } from 'expo-router';
import { useEffect } from 'react';

export default function ExploreRouteRedirect() {
  useEffect(() => {
    router.replace('/');
  }, []);
  return null;
}
