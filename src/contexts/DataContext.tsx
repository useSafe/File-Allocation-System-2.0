import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Cabinet, Shelf, Folder, Procurement } from '@/types/procurement';
import { onCabinetsChange, onShelvesChange, onFoldersChange, onProcurementsChange } from '@/lib/storage';

interface DataContextType {
    cabinets: Cabinet[];
    shelves: Shelf[];
    folders: Folder[];
    procurements: Procurement[];
    loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cabinets, setCabinets] = useState<Cabinet[]>([]);
    const [shelves, setShelves] = useState<Shelf[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [procurements, setProcurements] = useState<Procurement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // SWAPPED DATA FIX:
        // Cabinets node in Firebase has Shelves data (S1...)
        // Shelves node in Firebase has Cabinets data (C1...)
        // We swap the listeners here so the app receives correct objects directly.

        const unsubShelvesActual = onCabinetsChange((data) => {
            // This data is actually shelves (S1...)
            // But we want to store it as shelves
            // Wait.
            // If "cabinets" node has "shelves" (S1) data -> onCabinetsChange returns S1 objects.
            // We should setShelves(data).
            setShelves(data as unknown as Shelf[]);
        });

        const unsubCabinetsActual = onShelvesChange((data) => {
            // This data is actually cabinets (C1...)
            setCabinets(data as unknown as Cabinet[]);
        });

        const unsubFolders = onFoldersChange(setFolders);
        const unsubProcurements = onProcurementsChange(setProcurements);

        // Simple loading simulation or wait for initial data
        // In real app, we'd check if data is loaded.
        // For now, we just give it a small timeout or assume loaded on first callback
        const timer = setTimeout(() => setLoading(false), 500);

        return () => {
            unsubShelvesActual();
            unsubCabinetsActual();
            unsubFolders();
            unsubProcurements();
            clearTimeout(timer);
        };
    }, []);

    return (
        <DataContext.Provider value={{ cabinets, shelves, folders, procurements, loading }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
