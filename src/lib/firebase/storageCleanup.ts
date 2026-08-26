import { ref, listAll, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase/config";

export async function deleteFolder(path: string): Promise<void> {
  const folderRef = ref(storage, path);
  const res = await listAll(folderRef);

  await Promise.all(res.items.map((item) => deleteObject(item)));

  // If you ever have nested folders, you’d recurse on res.prefixes.
}
