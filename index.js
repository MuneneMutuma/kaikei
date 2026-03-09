/**
 * @format
 */

import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import notifee, { EventType } from '@notifee/react-native';
import { NotificationService } from './src/services/notifications/NotificationService';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS) {
    await NotificationService.handleBackgroundEvent({ type, detail });
  }
});

AppRegistry.registerComponent(appName, () => App);
