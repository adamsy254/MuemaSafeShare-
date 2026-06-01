export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: any; // Can be Timestamp or ISO string
  role?: 'admin' | 'user';
}

export interface FileMetadata {
  fileId: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  storagePath: string;
  size: number;
  permissionSetting: 'public' | 'restricted';
  description?: string;
  commentsAllowed?: boolean;
  upvotesCount?: number;
  downvotesCount?: number;
  voters?: Record<string, 'up' | 'down'>;
  createdAt: any; // Timestamp or ISO string
}

export interface Comment {
  commentId: string;
  fileId: string;
  userId: string;
  userName: string;
  userEmail: string;
  text: string;
  createdAt: any;
}

export interface DownloadRequest {
  requestId: string;
  fileId: string;
  fileName: string;
  fileType: 'image' | 'video' | 'audio';
  fileOwnerId: string;
  fileOwnerEmail: string;
  requesterId: string;
  requesterEmail: string;
  requesterName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  updatedAt: any;
}

export interface ContactSubmission {
  contactId: string;
  name: string;
  email: string;
  message: string;
  createdAt: any;
}
