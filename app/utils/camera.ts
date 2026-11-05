import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ImageItem {
  url: string;
  timestamp: string;
  smileCount: number;
  smileScore: number;
  hasWon: boolean;
  isLoading: boolean;
  isNounish: boolean;
  userId?: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-supabase')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;

const LOCAL_STORAGE_KEY = 'based_smiles_local_photos';

const SEED_PHOTOS: ImageItem[] = [
  {
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    smileCount: 14,
    smileScore: 5,
    hasWon: true,
    isLoading: false,
    isNounish: true,
    userId: 'did:privy:sample1'
  },
  {
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    smileCount: 29,
    smileScore: 5,
    hasWon: true,
    isLoading: false,
    isNounish: false,
    userId: 'did:privy:sample2'
  },
  {
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    smileCount: 7,
    smileScore: 4,
    hasWon: true,
    isLoading: false,
    isNounish: true,
    userId: 'did:privy:sample3'
  }
];

export const initCamera = async (
  videoRef: React.RefObject<HTMLVideoElement>
): Promise<boolean> => {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 480 },
        height: { ideal: 360 },
      },
      audio: false,
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.style.transform = 'scaleX(-1)';
    }
    return true;
  } catch (err) {
    console.warn('Unable to access webcam:', err);
    return false;
  }
};

export const compressImage = async (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 480;
      const MAX_HEIGHT = 360;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (compressed) => {
          if (compressed) resolve(compressed);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
  });
};

const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const uploadImage = async (
  blob: Blob,
  userId: string,
  isNounish: boolean
): Promise<{ url: string; isNounish: boolean }> => {
  if (supabase) {
    try {
      const fileName = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('smiles').upload(fileName, blob);
      if (!error) {
        const {
          data: { publicUrl },
        } = supabase.storage.from('smiles').getPublicUrl(fileName);
        return { url: publicUrl, isNounish };
      }
      console.warn('Supabase storage upload failed, using local store:', error);
    } catch (e) {
      console.warn('Supabase upload exception, falling back:', e);
    }
  }

  // Fallback: convert blob to Data URL for instant local storage
  const dataUrl = await blobToDataURL(blob);
  return { url: dataUrl, isNounish };
};

export const saveWinningPhoto = async (photo: {
  userId: string;
  imageUrl: string;
  smileScore: number;
  isNounish: boolean;
}): Promise<void> => {
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('photos')
        .select()
        .eq('image_url', photo.imageUrl)
        .single();

      if (!existing) {
        await supabase.from('photos').insert({
          user_id: photo.userId,
          image_url: photo.imageUrl,
          timestamp: new Date().toISOString(),
          smile_score: photo.smileScore,
          is_nounish: photo.isNounish,
          smile_count: 0,
        });
        return;
      }
    } catch (e) {
      console.warn('Error saving to Supabase photos table, saving locally:', e);
    }
  }

  // Save to local storage
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existingList: ImageItem[] = existingRaw ? JSON.parse(existingRaw) : SEED_PHOTOS;
    if (!existingList.some((item) => item.url === photo.imageUrl)) {
      const newItem: ImageItem = {
        url: photo.imageUrl,
        timestamp: new Date().toISOString(),
        smileCount: 0,
        smileScore: photo.smileScore,
        hasWon: photo.smileScore > 3,
        isLoading: false,
        isNounish: photo.isNounish,
        userId: photo.userId,
      };
      existingList.unshift(newItem);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingList));
    }
  } catch (e) {
    console.error('Failed to save photo locally:', e);
  }
};

export const loadExistingPhotos = async (): Promise<ImageItem[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((photo: any) => ({
          url: photo.image_url,
          timestamp: photo.created_at || photo.timestamp || new Date().toISOString(),
          smileCount: photo.smile_count || 0,
          smileScore: photo.smile_score,
          hasWon: photo.smile_score > 3,
          isLoading: false,
          isNounish: photo.is_nounish || false,
          userId: photo.user_id,
        }));
      }
    } catch (e) {
      console.warn('Could not load photos from Supabase, loading local:', e);
    }
  }

  // Load from local storage
  if (typeof window !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (existingRaw) {
        const parsed: ImageItem[] = JSON.parse(existingRaw);
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      }
      // Seed with initial photos
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_PHOTOS));
      return SEED_PHOTOS;
    } catch (e) {
      console.error('Error reading local photos:', e);
    }
  }

  return SEED_PHOTOS;
};

export const handleSmileBack = async (imageUrl: string): Promise<number> => {
  if (supabase) {
    try {
      const { data: currentData, error: fetchError } = await supabase
        .from('photos')
        .select('smile_count')
        .eq('image_url', imageUrl)
        .single();

      if (!fetchError && currentData) {
        const nextCount = (currentData.smile_count || 0) + 1;
        await supabase
          .from('photos')
          .update({ smile_count: nextCount })
          .eq('image_url', imageUrl);
        return nextCount;
      }
    } catch (e) {
      console.warn('Failed to update smile back in Supabase:', e);
    }
  }

  // Update in local storage
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (existingRaw) {
      const list: ImageItem[] = JSON.parse(existingRaw);
      const target = list.find((item) => item.url === imageUrl);
      if (target) {
        target.smileCount = (target.smileCount || 0) + 1;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
        return target.smileCount;
      }
    }
  } catch (e) {
    console.error('Error updating local smile count:', e);
  }
  return 1;
};

export const deletePhoto = async (imageUrl: string, userId: string): Promise<void> => {
  if (supabase) {
    try {
      await supabase.from('photos').delete().match({ user_id: userId, image_url: imageUrl });
      const fileName = imageUrl.split('/').pop();
      if (fileName) {
        await supabase.storage.from('smiles').remove([`${userId}/${fileName}`]);
      }
    } catch (e) {
      console.warn('Failed to delete in Supabase:', e);
    }
  }

  // Remove from local storage
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (existingRaw) {
      let list: ImageItem[] = JSON.parse(existingRaw);
      list = list.filter((item) => item.url !== imageUrl);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    console.error('Error deleting local photo:', e);
  }
};