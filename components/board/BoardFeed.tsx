'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getPostsByClass, createPost, toggleReaction, deletePost } from '@/lib/firestore/posts'
import { BoardPost } from '@/types/post'
import { timeAgo } from '@/lib/utils/classUtils'

export default function BoardFeed() {
  const { appUser } = useAuth()
  const [posts, setPosts]     = useState<BoardPost[]>([])
  const [content, setContent] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!appUser?.classId) return
    getPostsByClass(appUser.classId).then(setPosts)
  }, [appUser])

  const handlePost = async () => {
    if (!content.trim() || !appUser) return
    setLoading(true)
    const display = appUser.role === 'student'
      ? appUser.nickname
      : `${appUser.nameKr} 선생님`
    await createPost({
      classId: appUser.classId,
      authorUid: appUser.uid,
      authorDisplay: display,
      authorRole: appUser.role as 'student'|'teacher'|'admin',
      content,
    })
    const updated = await getPostsByClass(appUser.classId)
    setPosts(updated)
    setContent('')
    setShowEditor(false)
    setLoading(false)
  }

  const handleReaction = async (postId: string, emoji: string) => {
    if (!appUser) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const has = (post.reactions[emoji] ?? []).includes(appUser.uid)
    await toggleReaction(postId, emoji, appUser.uid, has)
    const updated = await getPostsByClass(appUser.classId)
    setPosts(updated)
  }

  const EMOJIS = ['❤️','👏','😊','🔥','👍']

  return (
    <div className="bg-white rounded-[20px] p-6 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-lg flex items-center gap-2">📌 우리반 게시판</h2>
        <button onClick={() => setShowEditor(!showEditor)}
          className="text-sm border-2 border-indigo-200 text-indigo-600 px-4 py-1.5 rounded-xl font-bold hover:bg-indigo-50 transition-colors">
          + 글쓰기
        </button>
      </div>

      {showEditor && (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 mb-4">
          <textarea
            className="w-full border-none outline-none text-sm resize-none min-h-[60px] font-['Noto_Sans_KR']"
            placeholder="우리반에 남기고 싶은 이야기를 써보세요 😊"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button onClick={handlePost} disabled={loading || !content.trim()}
              className="bg-indigo-600 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition-colors">
              {loading ? '게시 중...' : '게시하기'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {posts.map(post => (
          <div key={post.id} className="border border-gray-100 rounded-2xl p-4 hover:border-indigo-200 hover:bg-[#FAFAFE] transition-all">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-indigo-600">{post.authorDisplay}</span>
              <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
              {(appUser?.role !== 'student' || appUser.uid === post.authorUid) && (
                <button onClick={() => deletePost(post.id).then(() => setPosts(ps => ps.filter(p => p.id !== post.id)))}
                  className="ml-auto text-xs text-gray-300 hover:text-red-400">삭제</button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-gray-800">{post.content}</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {EMOJIS.map(emoji => {
                const uids = post.reactions[emoji] ?? []
                const active = appUser ? uids.includes(appUser.uid) : false
                return (
                  <button key={emoji} onClick={() => handleReaction(post.id, emoji)}
                    className={`text-sm px-3 py-1 rounded-full transition-all ${active ? 'bg-indigo-100' : 'bg-gray-100 hover:bg-indigo-50'}`}>
                    {emoji} {uids.length > 0 ? uids.length : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {posts.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">아직 게시글이 없어요. 첫 번째 글을 남겨보세요 😊</p>
        )}
      </div>
    </div>
  )
}
