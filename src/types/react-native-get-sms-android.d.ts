declare module 'react-native-get-sms-android' {
    export interface SmsFilter {
        box: 'inbox' | 'sent' | 'draft';
        address?: string;
        body?: string;
        maxCount?: number;
        indexFrom?: number;
    }

    export default class SmsAndroid {
        static list(
            filter: string,
            fail: (error: string) => void,
            success: (count: number, smsList: string) => void
        ): void;
    }
}
