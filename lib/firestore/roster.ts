import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, serverTimestamp, writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";

// ── 타입 ──────────────────────────────────────────────────────────
export interface RosterEntry {
  id:        string;
  nameKr:    string;   // 출석부 이름
  nickname:  string;   // 부르는 이름 (선생님 설정)
  studentId: string;   // 학번 (검증 키)
  schoolId:  string;
  semester:  string;
  classId:   string;
  status:    "unregistered" | "registered";
  uid:       string | null;  // 가입 후 연결
  createdAt: Timestamp | null;
}

const COL = (db: ReturnType<typeof import("firebase/firestore").getFirestore>) =>
  collection(db, "roster");

// ── 출석부 전체 조회 (선생님용) ──────────────────────────────────
export async function getRoster(
  schoolId: string,
  semester: string,
  classId:  string,
): Promise<RosterEntry[]> {
  const q = query(
    collection(db, "roster"),
    where("schoolId",  "==", schoolId),
    where("semester",  "==", semester),
    where("classId",   "==", classId),
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
  data: Partial<Pick<RosterEntry, "nameKr" | "nickname" | "studentId">>
) {
  return updateDoc(doc(db, "roster", id), data);
}

// ── 일괄 등록 (선생님 — 붙여넣기 방식) ──────────────────────────
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

// ── 가입 검증: 이름 + 학번 일치 여부 확인 ───────────────────────
export async function verifyRosterEntry(
  schoolId:  string,
  semester:  string,
  classId:   string,
  nameKr:    string,
  studentId: string,
): Promise<{ valid: boolean; entry?: RosterEntry; error?: string }> {
  const q = query(
    collection(db, "roster"),
    where("schoolId",  "==", schoolId),
    where("semester",  "==", semester),
    where("classId",   "==", classId),
    where("nameKr",    "==", nameKr.trim()),
    where("studentId", "==", studentId.trim()),
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    return { valid: false, error: "출석부에 등록된 이름과 학번이 일치하지 않아요." };
  }

  const entry = { id: snap.docs[0].id, ...snap.docs[0].data() } as RosterEntry;

  if (entry.status === "registered") {
    return { valid: false, error: "이미 가입된 계정이에요. 로그인해주세요." };
  }

  return { valid: true, entry };
}

// ── 가입 완료 시 roster uid 연결 ─────────────────────────────────
export async function linkRosterToUid(rosterId: string, uid: string) {
  return updateDoc(doc(db, "roster", rosterId), {
    status: "registered",
    uid,
  });
}

// ── 삭제 (선생님) ────────────────────────────────────────────────
export async function deleteRosterEntry(id: string) {
  const { deleteDoc } = await import("firebase/firestore");
  return deleteDoc(doc(db, "roster", id));
}