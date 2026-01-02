import { get, set, del } from 'idb-keyval';

export const saveAppState = async (key: string, value: any) => {
    try {
        await set(key, value);
    } catch (err) {
        console.error(`Failed to save ${key} to IndexedDB:`, err);
    }
};

export const loadAppState = async (key: string) => {
    try {
        return await get(key);
    } catch (err) {
        console.error(`Failed to load ${key} from IndexedDB:`, err);
        return null;
    }
};

export const clearAppState = async (key: string) => {
    try {
        await del(key);
    } catch (err) {
        console.error(`Failed to clear ${key} from IndexedDB:`, err);
    }
};
