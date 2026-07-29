//firebaseStorageService.js
import { deleteObject, ref } from 'firebase/storage';
import { storage } from '../config/firebase.js';

export const deleteFirebaseFileByPath = async storagePath => {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === 'storage/object-not-found') {
      return;
    }

    throw error;
  }
};