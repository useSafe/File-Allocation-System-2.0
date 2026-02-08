import { Cabinet, Shelf, Folder, Procurement, User, LocationStats } from '@/types/procurement';
import { db } from './firebase';
import { ref, get, set, remove, push, child, onValue, update } from 'firebase/database';

// ========== User Storage ==========
// We'll keep user storage local for now as it's just a simple simulation
// In a real app, this would use Firebase Auth
export const getStoredUser = (): User | null => {
    const data = localStorage.getItem('filetracker_user');
    return data ? JSON.parse(data) : null;
};

export const setStoredUser = (user: User | null): void => {
    if (user) {
        // Security: Do not store password or role in local storage
        const { password, role, ...safeUser } = user;
        localStorage.setItem('filetracker_user', JSON.stringify(safeUser));
    } else {
        localStorage.removeItem('filetracker_user');
    }
};

// ========== Realtime Subscriptions ==========
// These helpers allow components to subscribe to data changes

export const onCabinetsChange = (callback: (cabinets: Cabinet[]) => void) => {
    const cabinetsRef = ref(db, 'cabinets');
    return onValue(cabinetsRef, (snapshot) => {
        const data = snapshot.val();
        const cabinets = data ? Object.values(data) as Cabinet[] : [];
        callback(cabinets);
    });
};

export const onShelvesChange = (callback: (shelves: Shelf[]) => void) => {
    const shelvesRef = ref(db, 'shelves');
    return onValue(shelvesRef, (snapshot) => {
        const data = snapshot.val();
        const shelves = data ? Object.values(data) as Shelf[] : [];
        callback(shelves);
    });
};

export const onFoldersChange = (callback: (folders: Folder[]) => void) => {
    const foldersRef = ref(db, 'folders');
    return onValue(foldersRef, (snapshot) => {
        const data = snapshot.val();
        const folders = data ? Object.values(data) as Folder[] : [];
        callback(folders);
    });
};

export const onProcurementsChange = (callback: (procurements: Procurement[]) => void) => {
    const procurementsRef = ref(db, 'procurements');
    return onValue(procurementsRef, (snapshot) => {
        const data = snapshot.val();
        const procurements = data ? Object.values(data) as Procurement[] : [];
        callback(procurements);
    });
};

// ========== FETCH (Promise-based for one-time reads) ==========

export const getCabinets = async (): Promise<Cabinet[]> => {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, 'cabinets'));
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as Cabinet[];
    }
    return [];
};

export const getShelves = async (): Promise<Shelf[]> => {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, 'shelves'));
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as Shelf[];
    }
    return [];
};

export const getFolders = async (): Promise<Folder[]> => {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, 'folders'));
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as Folder[];
    }
    return [];
};

export const getProcurements = async (): Promise<Procurement[]> => {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, 'procurements'));
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as Procurement[];
    }
    return [];
};

// ========== WRITE OPERATIONS ==========

// --- Cabinet ---
export const addCabinet = async (name: string, code: string, description?: string): Promise<Cabinet> => {
    const id = crypto.randomUUID();
    const newCabinet: Cabinet = {
        id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim(),
        createdAt: new Date().toISOString(),
    };
    await set(ref(db, 'cabinets/' + id), newCabinet);
    return newCabinet;
};

export const updateCabinet = async (id: string, updates: Partial<Cabinet>): Promise<void> => {
    await update(ref(db, 'cabinets/' + id), updates);
};

export const deleteCabinet = async (id: string): Promise<void> => {
    // Also delete all shelves and folders in this cabinet
    // Note: In a real backend this should be a transaction or cloud function.
    // Client-side cascading delete is risky but sufficient for this demo.

    // 1. Get Shelves to delete
    const shelves = await getShelves();
    const cabinetShelves = shelves.filter(s => s.cabinetId === id);

    // 2. Delete Shelves (which will delete folders)
    for (const shelf of cabinetShelves) {
        await deleteShelf(shelf.id);
    }

    // 3. Delete Cabinet
    await remove(ref(db, 'cabinets/' + id));
};

// --- Shelf ---
export const addShelf = async (cabinetId: string, name: string, code: string, description?: string): Promise<Shelf> => {
    const id = crypto.randomUUID();
    const newShelf: Shelf = {
        id,
        cabinetId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim(),
        createdAt: new Date().toISOString(),
    };
    await set(ref(db, 'shelves/' + id), newShelf);
    return newShelf;
};

export const updateShelf = async (id: string, updates: Partial<Shelf>): Promise<void> => {
    await update(ref(db, 'shelves/' + id), updates);
};

export const deleteShelf = async (id: string): Promise<void> => {
    // 1. Get Folders
    const folders = await getFolders();
    const shelfFolders = folders.filter(f => f.shelfId === id);

    // 2. Delete Folders
    for (const folder of shelfFolders) {
        await deleteFolder(folder.id);
    }

    // 3. Delete Shelf
    await remove(ref(db, 'shelves/' + id));
};

// --- Folder ---
export const addFolder = async (shelfId: string, name: string, code: string, description?: string, color?: string): Promise<Folder> => {
    const id = crypto.randomUUID();
    const newFolder: Folder = {
        id,
        shelfId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim(),
        color: color || '#FF6B6B',
        createdAt: new Date().toISOString(),
    };
    await set(ref(db, 'folders/' + id), newFolder);
    return newFolder;
};

export const updateFolder = async (id: string, updates: Partial<Folder>): Promise<void> => {
    await update(ref(db, 'folders/' + id), updates);
};

export const deleteFolder = async (id: string): Promise<void> => {
    await remove(ref(db, 'folders/' + id));
};

// --- Procurement ---
export const addProcurement = async (
    procurement: Omit<Procurement, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByName'>,
    userEmail: string,
    userName: string
): Promise<Procurement> => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProcurement: Procurement = {
        ...procurement,
        id,
        createdBy: userEmail,
        createdByName: userName,
        createdAt: now,
        updatedAt: now,
    };
    await set(ref(db, 'procurements/' + id), newProcurement);
    return newProcurement;
};

export const updateProcurement = async (
    id: string,
    updates: Partial<Procurement>,
    userEmail?: string,
    userName?: string
): Promise<void> => {
    const updatePayload: any = {
        ...updates,
        updatedAt: new Date().toISOString()
    };

    // Add editor information if user info is provided
    if (userEmail && userName) {
        updatePayload.editedBy = userEmail;
        updatePayload.editedByName = userName;
        updatePayload.lastEditedAt = new Date().toISOString();
    }

    await update(ref(db, 'procurements/' + id), updatePayload);
};

export const deleteProcurement = async (id: string): Promise<void> => {
    await remove(ref(db, 'procurements/' + id));
};

// ========== Statistics ==========
export const getLocationStats = async (): Promise<LocationStats[]> => {
    const cabinets = await getCabinets();
    const procurements = await getProcurements();

    return cabinets
        .map(cabinet => ({
            cabinetId: cabinet.id,
            cabinetName: cabinet.name,
            count: procurements.filter(p => p.cabinetId === cabinet.id).length,
        }))
        .filter(stat => stat.count > 0)
        .sort((a, b) => b.count - a.count);
};

// ========== Initialization ==========
export const initializeDemoData = (): void => {
    // Blank initialization as requested
    console.log("Firebase initialized. No demo data added.");
};

// ========== User Management ==========

export const onUsersChange = (callback: (users: User[]) => void) => {
    const usersRef = ref(db, 'users');
    return onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        const users = data ? Object.values(data) as User[] : [];
        callback(users);
    });
};

export const addUser = async (user: User): Promise<void> => {
    // Generate ID if not provided, but usually provided by caller or randomUUID
    // We expect user object to be fully formed except maybe ID if we generate it here
    const userId = user.id || crypto.randomUUID();
    const newUser = { ...user, id: userId, createdAt: new Date().toISOString() };
    await set(ref(db, `users/${userId}`), newUser);
};

export const updateUser = async (id: string, updates: Partial<User>): Promise<void> => {
    await update(ref(db, `users/${id}`), updates);
};

export const deleteUser = async (id: string): Promise<void> => {
    await remove(ref(db, `users/${id}`));
};

export const ensureAdminUser = async () => {
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    let adminExists = false;

    if (snapshot.exists()) {
        const users = Object.values(snapshot.val()) as User[];
        // Check for admin email (case insensitive)
        if (users.some(u => u.email.toLowerCase() === 'admin@gmail.com')) {
            adminExists = true;
        }
    }

    if (!adminExists) {
        const adminUser: User = {
            id: crypto.randomUUID(),
            name: 'System Admin',
            email: 'admin@gmail.com',
            password: 'Cosmiano123@',
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString()
        };
        await set(ref(db, `users/${adminUser.id}`), adminUser);
        console.log('Seeded Admin User: admin@gmail.com');
    }
};
