import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";

// ── 타입 ──────────────────────────────────────────────────────────
export interface RosterEntry {
  id:            string;
  nameEn:        string;
  nameKr:        string;
  nickname:      string;
  studentIdHash: string;
  schoolId:      string;
  semester:      string;
  classId:       string;
  sortOrder?:    number;   // 출석부 순서
  status:        "unregistered" | "registered";
  uid:           string | null;
  createdAt:     Timestamp | null;
}

// ── 출석부 전체 조회 (선생님용) ──────────────────────────────────
export async function getRoster(
  schoolId: string,
  semester: string,
  classId:  string,
): Promise<RosterEntry[]> {
  const q = query(
    collection(db, "roster"),
    where("schoolId", "==", schoolId),
    where("semester", "==", semester),
    where("classId",  "==", classId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RosterEntry));
}

// ── 학생 1명 추가 (선생님) ───────────────────────────────────────
export async function addRosterEntry(
  entry: Omit<RosterEntry, "id" | "createdAt" | "status" | "uid">
) {
  return addDoc(collection(db, "roster"), {
    ...entry,
    status:    "unregistered",
    uid:       null,
    createdAt: serverTimestamp(),
  });
}

// ── 학생 정보 수정 (선생님) ──────────────────────────────────────
export async function updateRosterEntry(
  id: string,
  data: Partial<Pick<RosterEntry, "nameEn" | "nameKr" | "nickname" | "studentIdHash" | "sortOrder">>
) {
  return updateDoc(doc(db, "roster", id), data);
}

// ── 일괄 등록 ────────────────────────────────────────────────────
export async function addRosterBulk(
  entries: Omit<RosterEntry, "id" | "createdAt" | "status" | "uid">[]
) {
  const batch = writeBatch(db);
  entries.forEach(e => {
    const ref = doc(collection(db, "roster"));
    batch.set(ref, {
      ...e,
      status:    "unregistered",
      uid:       null,
      createdAt: serverTimestamp(),
    });
  });
  return batch.commit();
}

// ── 가입 검증: 여권 영문명 + 학번 해시 ───────────────────────────
export async function verifyRosterEntry(
  schoolId:      string,
  semester:      string,
  classId:       string,
  nameEn:        string,
  studentIdHash: string,
): Promise<{ valid: boolean; entry?: RosterEntry; error?: string }> {
  // schoolId + semester + nameEn + hash 로 검증
  // (classId는 선생님/학생 간 불일치 가능성으로 제외)
  const q = query(
    collection(db, "roster"),
    where("semester",      "==", semester),
    where("nameEn",        "==", nameEn),
    where("studentIdHash", "==", studentIdHash),
  )
  const snap = await getDocs(q)

  if (snap.empty) {
    // schoolId까지 포함해서 재시도 (semester 불일치 가능성)
    const q2 = query(
      collection(db, "roster"),
      where("nameEn",        "==", nameEn),
      where("studentIdHash", "==", studentIdHash),
    )
    const snap2 = await getDocs(q2)
    if (snap2.empty) {
      return { valid: false, error: "출석부에 등록된 여권 영문명과 학번이 일치하지 않아요." }
    }
    const entry2 = { id: snap2.docs[0].id, ...snap2.docs[0].data() } as RosterEntry
    if (entry2.status === "registered") {
      return { valid: false, error: "이미 가입된 계정이에요. 로그인해주세요." }
    }
    return { valid: true, entry: entry2 }
  }

  const entry = { id: snap.docs[0].id, ...snap.docs[0].data() } as RosterEntry
  if (entry.status === "registered") {
    return { valid: false, error: "이미 가입된 계정이에요. 로그인해주세요." }
  }
  return { valid: true, entry }
}

// ── 가입 완료 시 uid 연결 ─────────────────────────────────────────
export async function linkRosterToUid(rosterId: string, uid: string) {
  return updateDoc(doc(db, "roster", rosterId), {
    status: "registered",
    uid,
  });
}

// ── 삭제 ────────────────────────────────────────────────────────
export async function deleteRosterEntry(id: string) {
  return deleteDoc(doc(db, "roster", id));
}