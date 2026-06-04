// types/post.ts
export interface BoardPost {
  id: string
  classId: string
  authorUid: string
  authorDisplay: string
  authorRole: 'student' | 'teacher' | 'admin'
  content: string
  imageUrl?: string
  reactions: Record<string, string[]>
  createdAt: Date
}

export interface Comment {
  id: string
  postId: string
  authorUid: string
  authorDisplay: string
  content: string
  createdAt: Date
}