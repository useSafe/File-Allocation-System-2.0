import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deleteProcurement, updateProcurement, onProcurementsChange, onCabinetsChange, onShelvesChange, onFoldersChange } from '@/lib/storage';
import { Procurement, Cabinet, Shelf, Folder, ProcurementStatus, UrgencyLevel, ProcurementFilters } from '@/types/procurement';
import { toast } from 'sonner';
import {
    Plus,
    Search,
    MoreVertical,
    FileText,
    Trash2,
    Pencil,
    ChevronLeft,
    ChevronRight,
    MapPin,
    FilterX,
    Download,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
} from 'lucide-react';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ProcurementList: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const folderIdFromUrl = searchParams.get('folderId');

    const [procurements, setProcurements] = useState<Procurement[]>([]);

    // Location Data - Note: cabinets table stores Shelves (Tier 1), shelves table stores Cabinets (Tier 2)
    const [cabinets, setCabinets] = useState<Cabinet[]>([]); // These are actually Shelves (Tier 1)
    const [shelves, setShelves] = useState<Shelf[]>([]); // These are actually Cabinets (Tier 2)
    const [folders, setFolders] = useState<Folder[]>([]);

    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [editingProcurement, setEditingProcurement] = useState<Procurement | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    // Bulk Selection
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

    // Dynamic Edit Form Data
    const [editAvailableShelves, setEditAvailableShelves] = useState<Shelf[]>([]);
    const [editAvailableFolders, setEditAvailableFolders] = useState<Folder[]>([]);

    // Cascading Filter Data
    const [filterAvailableShelves, setFilterAvailableShelves] = useState<Shelf[]>([]);
    const [filterAvailableFolders, setFilterAvailableFolders] = useState<Folder[]>([]);

    // Filters (existing)
    const [filters, setFilters] = useState<ProcurementFilters>({
        search: '',
        cabinetId: '',
        shelfId: '',
        folderId: folderIdFromUrl || '',
        status: '', // kept for backward compatibility, not used for multi-select
        monthYear: '',
        urgencyLevel: '',
    });

    // New: multi-select status filter state (empty = all)
    const [statusFilters, setStatusFilters] = useState<string[]>([]);

    // Sorting state
    const [sortField, setSortField] = useState<'name' | 'prNumber' | 'date' | 'stackNumber'>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const itemsPerPage = 20;

    // Stack number calculation helper
    const calculateStackNumbers = (procurements: Procurement[], folderId: string): Map<string, number> => {
        // Get all Available files in this folder, sorted by stackNumber then dateAdded
        const availableInFolder = procurements
            .filter(p => p.folderId === folderId && p.status === 'archived')
            .sort((a, b) => {
                // If both have stack numbers, use them
                if (a.stackNumber && b.stackNumber) {
                    return a.stackNumber - b.stackNumber;
                }
                // Otherwise sort by date added (older first)
                return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
            });

        // Assign sequential stack numbers
        const stackMap = new Map<string, number>();
        availableInFolder.forEach((p, index) => {
            stackMap.set(p.id, index + 1);
        });

        return stackMap;
    };

    // Update stack numbers for all files in a folder
    const updateStackNumbersForFolder = async (folderId: string) => {
        const stackMap = calculateStackNumbers(procurements, folderId);

        // Update each file in the folder
        for (const [procId, stackNum] of stackMap.entries()) {
            await updateProcurement(procId, { stackNumber: stackNum });
        }

        // Clear stack number for borrowed files in this folder
        const borrowedInFolder = procurements
            .filter(p => p.folderId === folderId && p.status === 'active');
        for (const proc of borrowedInFolder) {
            if (proc.stackNumber !== undefined) {
                await updateProcurement(proc.id, { stackNumber: undefined });
            }
        }
    };


    // Status change confirmation
    const [pendingStatusChange, setPendingStatusChange] = useState<{
        procurement: Procurement;
        newStatus: ProcurementStatus;
    } | null>(null);
    const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);

    // Borrow edit modal
    const [borrowEditModal, setBorrowEditModal] = useState<{
        procurement: Procurement;
        borrowedBy: string;
        division: string;
    } | null>(null);

    // Helper functions for status
    const getStatusLabel = (status: ProcurementStatus): string => {
        return status === 'active' ? 'Borrowed' : 'Archived';
    };

    const getStatusColor = (status: ProcurementStatus): string => {
        return status === 'active'
            ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    };

    // Status change workflow
    const handleStatusChange = (procurement: Procurement, newStatus: ProcurementStatus) => {
        setPendingStatusChange({ procurement, newStatus });
        setIsStatusConfirmOpen(true);
    };

    const proceedStatusChange = () => {
        if (!pendingStatusChange) return;

        const { procurement, newStatus } = pendingStatusChange;

        if (newStatus === 'active') {
            // Going to Borrowed - show edit modal
            setBorrowEditModal({
                procurement,
                borrowedBy: procurement.borrowedBy || '',
                division: procurement.division || ''
            });
            setIsStatusConfirmOpen(false);
            setPendingStatusChange(null);
        } else {
            // Going to Available - just update
            confirmReturnFile(procurement);
        }
    };

    const saveBorrowChanges = async () => {
        if (!borrowEditModal) return;

        const { procurement, borrowedBy, division } = borrowEditModal;

        if (!borrowedBy || !division) {
            toast.error('Please fill in all required fields');
            return;
        }

        try {
            await updateProcurement(procurement.id, {
                status: 'active',
                borrowedBy,
                division,
                borrowedDate: new Date().toISOString()
            });

            // Recalculate stack numbers
            await updateStackNumbersForFolder(procurement.folderId);

            setBorrowEditModal(null);
            toast.success('File marked as borrowed');
        } catch (error) {
            toast.error('Failed to update file status');
        }
    };

    const confirmReturnFile = async (procurement: Procurement) => {
        try {
            await updateProcurement(procurement.id, {
                status: 'archived',
                returnDate: new Date().toISOString()
            });

            // Recalculate stack numbers
            await updateStackNumbersForFolder(procurement.folderId);

            setIsStatusConfirmOpen(false);
            setPendingStatusChange(null);
            toast.success('File returned and marked as archived');
        } catch (error) {
            toast.error('Failed to return file');
        }
    };

    useEffect(() => {
        // Subscribe to real-time updates
        const unsubProcurements = onProcurementsChange(setProcurements);
        const unsubCabinets = onCabinetsChange(setCabinets);
        const unsubShelves = onShelvesChange(setShelves);
        const unsubFolders = onFoldersChange(setFolders);

        return () => {
            unsubProcurements();
            unsubCabinets();
            unsubShelves();
            unsubFolders();
        };
    }, []);

    useEffect(() => {
        if (folderIdFromUrl) {
            const folder = folders.find(f => f.id === folderIdFromUrl);
            if (folder) {
                const shelf = shelves.find(s => s.id === folder.shelfId);
                if (shelf) {
                    setFilters(prev => ({
                        ...prev,
                        cabinetId: shelf.cabinetId,
                        shelfId: folder.shelfId,
                        folderId: folderIdFromUrl
                    }));
                }
            }
        }
    }, [folderIdFromUrl, folders, shelves]);

    // Read search parameter from URL and populate search box
    useEffect(() => {
        const searchFromUrl = searchParams.get('search');
        if (searchFromUrl) {
            setFilters(prev => ({
                ...prev,
                search: searchFromUrl
            }));
        }
    }, [searchParams]);

    // Update edit form cascading dropdowns
    useEffect(() => {
        if (editingProcurement && editingProcurement.cabinetId) {
            setEditAvailableShelves(shelves.filter(s => s.cabinetId === editingProcurement.cabinetId));
        } else {
            setEditAvailableShelves([]);
        }
    }, [editingProcurement?.cabinetId, shelves]);

    useEffect(() => {
        if (editingProcurement && editingProcurement.shelfId) {
            setEditAvailableFolders(folders.filter(f => f.shelfId === editingProcurement.shelfId));
        } else {
            setEditAvailableFolders([]);
        }
    }, [editingProcurement?.shelfId, folders]);

    // Update filter cascading dropdowns
    useEffect(() => {
        if (filters.cabinetId) {
            setFilterAvailableShelves(shelves.filter(s => s.cabinetId === filters.cabinetId));
        } else {
            setFilterAvailableShelves([]);
        }
    }, [filters.cabinetId, shelves]);

    useEffect(() => {
        if (filters.shelfId) {
            setFilterAvailableFolders(folders.filter(f => f.shelfId === filters.shelfId));
        } else {
            setFilterAvailableFolders([]);
        }
    }, [filters.shelfId, folders]);

    // build status options based on current procurements (fall back to common ones)
    // Filter options
    const statusOptions: ProcurementStatus[] = ['active', 'archived'];

    const toggleStatusFilter = (status: string) => {
        setStatusFilters(prev => {
            if (prev.includes(status)) return prev.filter(s => s !== status);
            return [...prev, status];
        });
    };

    const filteredProcurements = (procurements || []).filter(procurement => {
        const matchesSearch =
            procurement.prNumber.toLowerCase().includes(filters.search.toLowerCase()) ||
            procurement.description.toLowerCase().includes(filters.search.toLowerCase());

        const matchesCabinet = !filters.cabinetId || filters.cabinetId === 'all_cabinets' || procurement.cabinetId === filters.cabinetId;
        const matchesShelf = !filters.shelfId || filters.shelfId === 'all_shelves' || procurement.shelfId === filters.shelfId;
        const matchesFolder = !filters.folderId || filters.folderId === 'all_folders' || procurement.folderId === filters.folderId;

        // New: multi-select status filtering (empty -> all)
        const matchesStatus = statusFilters.length === 0 || statusFilters.includes(procurement.status);

        const matchesUrgency = !filters.urgencyLevel || filters.urgencyLevel === 'all_urgency' || procurement.urgencyLevel === (filters.urgencyLevel as UrgencyLevel);

        return matchesSearch && matchesCabinet && matchesShelf && matchesFolder && matchesStatus && matchesUrgency;
    }).sort((a, b) => {
        let comparison = 0;

        if (sortField === 'name') {
            comparison = a.description.localeCompare(b.description);
        } else if (sortField === 'prNumber') {
            comparison = a.prNumber.localeCompare(b.prNumber);
        } else if (sortField === 'date') {
            // Reverse comparison for date: newer dates first when ascending
            comparison = new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
        } else if (sortField === 'stackNumber') {
            // Sort by stack number (files without stack numbers go to end)
            const aStack = a.stackNumber || 999;
            const bStack = b.stackNumber || 999;
            comparison = aStack - bStack;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    const totalPages = Math.ceil(filteredProcurements.length / itemsPerPage);
    const paginatedProcurements = filteredProcurements.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );



    const clearFilters = () => {
        setFilters({
            search: '',
            cabinetId: '',
            shelfId: '',
            folderId: '',
            status: '',
            monthYear: '',
            urgencyLevel: '',
        });
        // clear multi-select status
        setStatusFilters([]);
        // reset sorting
        setSortField('date');
        setSortDirection('asc');
        setCurrentPage(1);
    };

    const handleEdit = (procurement: Procurement) => {
        setEditingProcurement(procurement);
        setIsEditDialogOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingProcurement) return;

        try {
            await updateProcurement(
                editingProcurement.id,
                editingProcurement,
                user?.email,
                user?.name
            );
            setIsEditDialogOpen(false);
            setEditingProcurement(null);
            toast.success('Record updated successfully');
        } catch (error) {
            toast.error('Failed to update record');
        }
    };

    const handleDelete = () => {
        if (deleteId) {
            deleteProcurement(deleteId);
            toast.success('Record deleted successfully');
            setDeleteId(null);
        }
    };

    // Status change handlers




    // Updated to show: Shelf-Cabinet-Folder (S1-C1-F1)
    const getLocationString = (p: Procurement) => {
        const shelf = cabinets.find(c => c.id === p.cabinetId)?.code || '?'; // cabinetId points to Shelf (Tier 1)
        const cabinet = shelves.find(s => s.id === p.shelfId)?.code || '?'; // shelfId points to Cabinet (Tier 2)
        const folder = folders.find(f => f.id === p.folderId)?.code || '?'; // folderId points to Folder (Tier 3)
        return `${shelf}-${cabinet}-${folder}`;
    };

    const exportToCSV = () => {
        const exportData = filteredProcurements.map(p => {
            const shelf = cabinets.find(c => c.id === p.cabinetId);
            const cabinet = shelves.find(s => s.id === p.shelfId);
            const folder = folders.find(f => f.id === p.folderId);

            return {
                'PR Number': p.prNumber,
                'Description': p.description,
                'Location': getLocationString(p),
                'Shelf': shelf?.name || '',
                'Cabinet': cabinet?.name || '',
                'Folder': folder?.name || '',
                'Status': p.status.charAt(0).toUpperCase() + p.status.slice(1),
                'Date Added': format(new Date(p.dateAdded), 'MMM d, yyyy'),
                'Created At': format(new Date(p.createdAt), 'MMM d, yyyy HH:mm'),
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `procurement_records_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
        toast.success('Exported to CSV successfully');
    };

    const handleExportExcel = () => {
        const exportData = filteredProcurements.map(p => ({
            'PR Number': p.prNumber,
            'Description': p.description,
            'Location': getLocationString(p),
            'Status': p.status,
            'Urgency': p.urgencyLevel,
            'Date Added': format(new Date(p.dateAdded), 'MMM d, yyyy'),
            'Tags': p.tags.join(', '),
            'Notes': p.notes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Procurements');

        const filename = `procurement-records-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(wb, filename);

        toast.success('Excel file exported successfully');
    };

    const handleExportPDFSummary = () => {
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('Procurement Records - Summary Report', 14, 20);

        doc.setFontSize(10);
        doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy - hh:mm a')}`, 14, 28);

        const summaryData = filteredProcurements.map(p => [
            p.prNumber,
            p.description.substring(0, 40) + (p.description.length > 40 ? '...' : ''),
            getLocationString(p),
            p.status,
            format(new Date(p.dateAdded), 'MMM d, yyyy')
        ]);

        autoTable(doc, {
            head: [['PR Number', 'Description', 'Location', 'Status', 'Date Added']],
            body: summaryData,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
            styles: { fontSize: 9 },
        });

        doc.save(`procurement-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast.success('PDF summary exported successfully');
    };

    const handleExportPDFFull = () => {
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('Procurement Records - Full Report', 14, 20);

        doc.setFontSize(10);
        doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy - hh:mm a')}`, 14, 28);

        const fullData = filteredProcurements.map(p => [
            p.prNumber,
            p.description.substring(0, 30) + (p.description.length > 30 ? '...' : ''),
            getLocationString(p),
            p.status,
            p.urgencyLevel,
            format(new Date(p.dateAdded), 'MMM d, yyyy'),
            p.tags.join(', ').substring(0, 20),
            p.createdByName || 'N/A'
        ]);

        autoTable(doc, {
            head: [['PR #', 'Description', 'Location', 'Status', 'Urgency', 'Date', 'Tags', 'Created By']],
            body: fullData,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
            styles: { fontSize: 8 },
        });

        doc.save(`procurement-full-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast.success('PDF full report exported successfully');
    };

    const handleDeleteConfirm = async () => {
        if (!deleteId) return;

        try {
            await deleteProcurement(deleteId);
            toast.success('Record deleted successfully');
            setDeleteId(null);
            if (selectedIds.includes(deleteId)) {
                setSelectedIds(prev => prev.filter(id => id !== deleteId));
            }
        } catch (error) {
            toast.error('Failed to delete record');
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const currentIds = paginatedProcurements.map(p => p.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...currentIds])));
        } else {
            const currentIds = paginatedProcurements.map(p => p.id);
            setSelectedIds(prev => prev.filter(id => !currentIds.includes(id)));
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        try {
            await Promise.all(selectedIds.map(id => deleteProcurement(id)));

            toast.success(`${selectedIds.length} records deleted successfully`);
            setSelectedIds([]);
            setIsBulkDeleteDialogOpen(false);
        } catch (error) {
            console.error('Bulk delete error:', error);
            toast.error('Failed to delete some records');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Records</h1>

                    <p className="text-slate-400 mt-1">View and manage file tracking records</p>
                </div>

                <div className="flex gap-2">
                    {selectedIds.length > 0 && (
                        <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Selected ({selectedIds.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#1e293b] border-slate-800 text-white">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {selectedIds.length} Records?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-slate-400">
                                        This action cannot be undone. This will permanently delete the selected procurement records.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-transparent border-slate-700 text-white hover:bg-slate-800">Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete All</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Download className="mr-2 h-4 w-4" />
                                Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[#1e293b] border-slate-700 text-white">
                            <DropdownMenuItem
                                onClick={exportToCSV}
                                className="cursor-pointer focus:bg-slate-700"
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Export as CSV
                            </DropdownMenuItem>
                            {/* <DropdownMenuItem
                                onClick={handleExportExcel}
                                className="cursor-pointer focus:bg-slate-700"
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Export as Excel
                            </DropdownMenuItem> */}

                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <Card className="border-none bg-[#0f172a] shadow-lg">
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search PR Number or description..."
                                className="pl-9 bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500"
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-2 bg-[#1e293b] rounded-md border border-slate-700 p-1">
                                <Select
                                    value={filters.cabinetId}
                                    onValueChange={(value) => setFilters({
                                        ...filters,
                                        cabinetId: value,
                                        shelfId: '', // Reset child
                                        folderId: '' // Reset child
                                    })}
                                >
                                    <SelectTrigger className="w-[150px] border-none bg-transparent text-white focus:ring-0">
                                        <SelectValue placeholder="Shelf" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                        <SelectItem value="all_cabinets">All Shelves</SelectItem>
                                        {cabinets.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2 bg-[#1e293b] rounded-md border border-slate-700 p-1">
                                <Select
                                    value={filters.shelfId}
                                    onValueChange={(value) => setFilters({
                                        ...filters,
                                        shelfId: value,
                                        folderId: '' // Reset child
                                    })}
                                    disabled={!filters.cabinetId}
                                >
                                    <SelectTrigger className="w-[150px] border-none bg-transparent text-white focus:ring-0">
                                        <SelectValue placeholder="Cabinet" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                        <SelectItem value="all_shelves">All Cabinets</SelectItem>
                                        {filterAvailableShelves.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2 bg-[#1e293b] rounded-md border border-slate-700 p-1">
                                <Select
                                    value={filters.folderId}
                                    onValueChange={(value) => setFilters({ ...filters, folderId: value })}
                                    disabled={!filters.shelfId}
                                >
                                    <SelectTrigger className="w-[150px] border-none bg-transparent text-white focus:ring-0">
                                        <SelectValue placeholder="Folder" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                        <SelectItem value="all_folders">All Folders</SelectItem>
                                        {filterAvailableFolders.map((f) => (
                                            <SelectItem key={f.id} value={f.id}>{f.code} - {f.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* STATUS multi-select dropdown */}
                            <div className="flex items-center gap-2 bg-[#1e293b] rounded-md border border-slate-700 p-1">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="flex items-center gap-2 text-white px-3 py-1">
                                            <span>Status</span>
                                            {statusFilters.length > 0 && (
                                                <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-emerald-600 text-white text-xs font-medium">
                                                    {statusFilters.length}
                                                </span>
                                            )}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="bg-[#1e293b] border-slate-700 text-white p-3 w-56">
                                        <div className="mb-2 text-slate-300 text-sm">Select status</div>
                                        <div className="flex flex-col gap-2 max-h-48 overflow-auto">


                                            {statusOptions.map((status) => (
                                                <div key={status} className="flex items-center gap-2">
                                                    <Checkbox
                                                        checked={statusFilters.includes(status)}
                                                        onCheckedChange={() => toggleStatusFilter(status)}
                                                        className="border-slate-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleStatusFilter(status)}
                                                        className="text-sm text-slate-200 text-left w-full"
                                                    >
                                                        {getStatusLabel(status)}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* SORT controls */}
                            <div className="flex items-center gap-2 bg-[#1e293b] rounded-md border border-slate-700 p-1">
                                <Select value={sortField} onValueChange={(value) => setSortField(value as 'name' | 'prNumber' | 'date' | 'stackNumber')}>
                                    <SelectTrigger className="w-[150px] border-none bg-transparent text-white focus:ring-0">
                                        <SelectValue placeholder="Sort by" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                        <SelectItem value="name">Name</SelectItem>
                                        <SelectItem value="prNumber">PR Number</SelectItem>
                                        <SelectItem value="date">Date Added</SelectItem>
                                        <SelectItem value="stackNumber">Stack Number</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="h-8 w-8 text-slate-400 hover:text-white"
                                    title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                                </Button>
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={clearFilters}
                                className="bg-[#1e293b] border-slate-700 text-slate-400 hover:text-white"
                                title="Clear Filters"
                            >
                                <FilterX className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-slate-800 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-transparent">
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={paginatedProcurements.length > 0 && paginatedProcurements.every(p => selectedIds.includes(p.id))}
                                            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                            className="border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                    </TableHead>
                                    <TableHead className="text-slate-300">PR Number</TableHead>
                                    <TableHead className="text-slate-300">Description</TableHead>
                                    <TableHead className="text-slate-300">Location</TableHead>
                                    <TableHead className="text-center text-slate-300">Stack</TableHead>
                                    <TableHead className="text-slate-300">Folder</TableHead>
                                    <TableHead className="text-slate-300">Status</TableHead>
                                    <TableHead className="text-slate-300">Date</TableHead>
                                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedProcurements.length === 0 ? (
                                    <TableRow className="border-slate-800">
                                        <TableCell colSpan={10} className="h-24 text-center text-slate-500">
                                            No records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedProcurements.map((procurement) => (
                                        <TableRow key={procurement.id} className="border-slate-800 hover:bg-[#1e293b]">
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedIds.includes(procurement.id)}
                                                    onCheckedChange={(checked) => handleSelectOne(procurement.id, checked as boolean)}
                                                    className="border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-white">
                                                {procurement.prNumber}
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate text-slate-400">
                                                {procurement.description}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-slate-300">
                                                    <MapPin className="h-3 w-3 text-blue-500" />
                                                    <span className="font-mono text-xs bg-slate-800 px-2 py-1 rounded">
                                                        {getLocationString(procurement)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-slate-400 text-sm font-mono">
                                                    {procurement.status === 'archived' && procurement.stackNumber
                                                        ? `↕${procurement.stackNumber}`
                                                        : '-'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="h-6 w-6 rounded-md border border-slate-600 flex-shrink-0"
                                                        style={{
                                                            backgroundColor: folders.find(f => f.id === procurement.folderId)?.color || '#FF6B6B'
                                                        }}
                                                    />
                                                    <span className="text-slate-400 text-sm font-mono">
                                                        {folders.find(f => f.id === procurement.folderId)?.code || '?'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={procurement.status}
                                                    onValueChange={(value) => handleStatusChange(procurement, value as ProcurementStatus)}
                                                >
                                                    <SelectTrigger className={`w-[130px] border ${getStatusColor(procurement.status)}`}>
                                                        <SelectValue>
                                                            {getStatusLabel(procurement.status)}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                                        <SelectItem value="active">Borrowed</SelectItem>
                                                        <SelectItem value="archived">Archived</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-slate-400">
                                                {format(new Date(procurement.dateAdded), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(procurement)}
                                                        className="h-8 bg-blue-600/10 border border-blue-600/20 text-blue-500 hover:bg-blue-600/20 hover:text-blue-400"
                                                    >
                                                        <Pencil className="h-4 w-4 mr-1" />
                                                        Edit
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setDeleteId(procurement.id)}
                                                                className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent className="bg-[#1e293b] border-slate-800 text-white">
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete Record?</AlertDialogTitle>
                                                                <AlertDialogDescription className="text-slate-400">
                                                                    This action cannot be undone. This will permanently delete the procurement record.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel className="bg-transparent border-slate-700 text-white hover:bg-slate-800">Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="bg-[#1e293b] border-slate-700 text-white disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="bg-[#1e293b] border-slate-700 text-white disabled:opacity-50"
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                )}
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="border-slate-800 bg-[#0f172a] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Record</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Update the procurement details and location.
                        </DialogDescription>
                    </DialogHeader>

                    {editingProcurement && (
                        <div className="grid gap-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-slate-300">PR Number</Label>
                                    <Input
                                        value={editingProcurement.prNumber}
                                        onChange={(e) => setEditingProcurement({ ...editingProcurement, prNumber: e.target.value })}
                                        className="bg-[#1e293b] border-slate-700 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Date Added</Label>
                                    <Input
                                        value={format(new Date(editingProcurement.dateAdded), 'yyyy-MM-dd')}
                                        disabled
                                        className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-300">Description</Label>
                                <Textarea
                                    value={editingProcurement.description}
                                    onChange={(e) => setEditingProcurement({ ...editingProcurement, description: e.target.value })}
                                    className="bg-[#1e293b] border-slate-700 text-white"
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2 border-t border-slate-800 pt-4">
                                <Label className="text-lg font-semibold text-white">Location</Label>
                                <p className="text-xs text-slate-400">Shelf → Cabinet → Folder</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Shelf</Label>
                                    <Select
                                        value={editingProcurement.cabinetId}
                                        onValueChange={(val) => setEditingProcurement({
                                            ...editingProcurement,
                                            cabinetId: val,
                                            shelfId: '', // Reset child
                                            folderId: '' // Reset child
                                        })}
                                    >
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                            {cabinets.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Cabinet</Label>
                                    <Select
                                        value={editingProcurement.shelfId}
                                        onValueChange={(val) => setEditingProcurement({
                                            ...editingProcurement,
                                            shelfId: val,
                                            folderId: '' // Reset child
                                        })}
                                        disabled={!editingProcurement.cabinetId}
                                    >
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                            {editAvailableShelves.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Folder</Label>
                                    <Select
                                        value={editingProcurement.folderId}
                                        onValueChange={(val) => setEditingProcurement({ ...editingProcurement, folderId: val })}
                                        disabled={!editingProcurement.shelfId}
                                    >
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                            {editAvailableFolders.map((f) => (
                                                <SelectItem key={f.id} value={f.id}>{f.code} - {f.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="border-t border-slate-800 pt-4">
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Status</Label>
                                    <Select
                                        value={editingProcurement.status}
                                        onValueChange={(val) => setEditingProcurement({ ...editingProcurement, status: val as ProcurementStatus })}
                                    >
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectItem value="active">Borrowed</SelectItem>
                                            <SelectItem value="archived">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Borrower Information Section - Always shown */}
                            <div className="space-y-4 border-t border-slate-800 pt-4">
                                <Label className="text-lg font-semibold text-white">Borrower Information</Label>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Borrowed By</Label>
                                        <Input
                                            value={editingProcurement.borrowedBy || ''}
                                            onChange={(e) => setEditingProcurement({ ...editingProcurement, borrowedBy: e.target.value })}
                                            className="bg-[#1e293b] border-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                            placeholder="Enter name"
                                            disabled={editingProcurement.status === 'archived'}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Division</Label>
                                        <Input
                                            value={editingProcurement.division || ''}
                                            onChange={(e) => setEditingProcurement({ ...editingProcurement, division: e.target.value })}
                                            className="bg-[#1e293b] border-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                            placeholder="Enter division"
                                            disabled={editingProcurement.status === 'archived'}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Borrowed Date</Label>
                                        <Input
                                            type="text"
                                            value={editingProcurement.borrowedDate ? format(new Date(editingProcurement.borrowedDate), 'MMMM d, yyyy') : 'Not set'}
                                            disabled
                                            className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Return Date</Label>
                                        <Input
                                            type="text"
                                            value={editingProcurement.returnDate ? format(new Date(editingProcurement.returnDate), 'MMMM d, yyyy') : 'Not set'}
                                            disabled
                                            className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Record History Section */}
                            <div className="space-y-4 border-t border-slate-800 pt-4">
                                <Label className="text-lg font-semibold text-white">Record History</Label>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Created By</Label>
                                        <Input
                                            value={`${editingProcurement.createdByName || 'Unknown'} (${editingProcurement.createdBy || 'N/A'})`}
                                            disabled
                                            className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Created At</Label>
                                        <Input
                                            value={format(new Date(editingProcurement.createdAt), 'MMMM d, yyyy - hh:mm a')}
                                            disabled
                                            className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                {editingProcurement.editedBy && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Last Edited By</Label>
                                            <Input
                                                value={`${editingProcurement.editedByName || 'Unknown'} (${editingProcurement.editedBy})`}
                                                disabled
                                                className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Last Edited At</Label>
                                            <Input
                                                value={editingProcurement.lastEditedAt ? format(new Date(editingProcurement.lastEditedAt), 'MMMM d, yyyy - hh:mm a') : 'N/A'}
                                                disabled
                                                className="bg-[#1e293b]/50 border-slate-700 text-slate-400 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="border-slate-700 text-white hover:bg-slate-800">
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Status Change Confirmation Modal */}
            <AlertDialog open={isStatusConfirmOpen} onOpenChange={setIsStatusConfirmOpen}>
                <AlertDialogContent className="bg-[#1e293b] border-slate-800 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pendingStatusChange?.newStatus === 'active'
                                ? 'Mark as Borrowed?'
                                : 'Mark as Available?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            {pendingStatusChange?.newStatus === 'active'
                                ? 'You will need to enter borrower details in the next step.'
                                : 'This will mark the file as returned and available. The return date will be automatically recorded.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-transparent border-slate-700 text-white hover:bg-slate-800">
                            Close
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={proceedStatusChange}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Proceed
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Borrow Edit Modal */}
            <Dialog open={!!borrowEditModal} onOpenChange={() => setBorrowEditModal(null)}>
                <DialogContent className="bg-[#0f172a] border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>Borrow File</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Enter the borrower details. The borrowed date will be automatically recorded.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="borrowedBy" className="text-slate-300">Borrowed By *</Label>
                            <Input
                                id="borrowedBy"
                                value={borrowEditModal?.borrowedBy || ''}
                                onChange={(e) => setBorrowEditModal(prev =>
                                    prev ? { ...prev, borrowedBy: e.target.value } : null
                                )}
                                placeholder="Enter name"
                                className="bg-[#1e293b] border-slate-700 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="division" className="text-slate-300">Division *</Label>
                            <Input
                                id="division"
                                value={borrowEditModal?.division || ''}
                                onChange={(e) => setBorrowEditModal(prev =>
                                    prev ? { ...prev, division: e.target.value } : null
                                )}
                                placeholder="Enter division"
                                className="bg-[#1e293b] border-slate-700 text-white"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setBorrowEditModal(null)}
                            className="border-slate-700 text-white hover:bg-slate-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={saveBorrowChanges}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default ProcurementList;










