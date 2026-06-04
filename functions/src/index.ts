import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getNextKey } from './utils/keyRotator'
import { buildFeedbackPrompt } from './gemini/promptTemplates'

admin.initializeApp()
const db = admin.firestore()

export const generateFeedback = functions
  .region('asia-northeast3')
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인 필요')
    const { content, level, assignment, grammar, submissionId } = data
    if (content.length < 150) throw new functions.https.HttpsError('invalid-argument', '150자 이상 필요')
    if (content.length > 2000) throw new functions.https.HttpsError('invalid-argument', '2000자 초과')

    await db.collection('submissions').doc(submissionId).update({ status: 'ai_processing' })

    const genAI = new GoogleGenerativeAI(getNextKey())
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(buildFeedbackPrompt(content, level ?? '고급', assignment, grammar))
    const text   = result.response.text().replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)

    await db.collection('feedback').add({
      submissionId,
      studentUid: context.auth.uid,
      aiFeedback: { ...parsed, generatedAt: admin.firestore.FieldValue.serverTimestamp() },
      teacherComment: '',
      teacherApproved: false,
    })
    await db.collection('submissions').doc(submissionId).update({ status: 'ai_done' })
    return { success: true }
  })
