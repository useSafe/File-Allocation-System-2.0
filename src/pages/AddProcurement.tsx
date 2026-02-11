import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { addProcurement, updateProcurement } from '@/lib/storage';
import { useData } from '@/contexts/DataContext';
import { Cabinet, Shelf, Folder, ProcurementStatus, Procurement } from '@/types/procurement';
import { toast } from 'sonner';
import { Loader2, Save, CalendarIcon, Layers } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const AddProcurement: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const { cabinets, shelves, folders, procurements } = useData();

    // Filtered location options based on selection
    const [availableCabinets, setAvailableCabinets] = useState<Shelf[]>([]);
    const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);

    // Form State
    const [prNumber, setPrNumber] = useState('');
    const [description, setDescription] = useState('');
    const [shelfId, setShelfId] = useState('');    // maps to cabinetId field in DB (Tier 1 - Shelf)
    const [cabinetId, setCabinetId] = useState(''); // maps to shelfId field in DB (Tier 2 - Cabinet)
    const [folderId, setFolderId] = useState('');
    const [status, setStatus] = useState<ProcurementStatus>('archived');
    const [date, setDate] = useState<Date | undefined>(new Date());

    // Computed stack number preview
    const [previewStackNumber, setPreviewStackNumber] = useState<number | null>(null);

    // Update available cabinets when shelf changes
    useEffect(() => {
        if (shelfId) {
            setAvailableCabinets(shelves.filter(s => s.cabinetId === shelfId));
            setCabinetId('');
            setFolderId('');
            setPreviewStackNumber(null);
        } else {
            setAvailableCabinets([]);
        }
    }, [shelfId, shelves]);

    // Update available folders when cabinet changes
    useEffect(() => {
        if (cabinetId) {
            setAvailableFolders(folders.filter(f => f.shelfId === cabinetId));
            setFolderId('');
            setPreviewStackNumber(null);
        } else {
            setAvailableFolders([]);
        }
    }, [cabinetId, folders]);

    // Recalculate preview stack number whenever folderId or status changes
    useEffect(() => {
        if (folderId && status === 'archived') {
            const archivedInFolder = procurements.filter(
                p => p.folderId === folderId && p.status === 'archived'
            );
            setPreviewStackNumber(archivedInFolder.length + 1);
        } else {
            setPreviewStackNumber(null);
        }
    }, [folderId, status, procurements]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prNumber || !description || !shelfId || !cabinetId || !folderId) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        try {
            const procurementData: any = {
                prNumber,
                description,
                cabinetId: shelfId,   // Store shelfId into cabinetId field (Tier 1)
                shelfId: cabinetId,   // Store cabinetId into shelfId field (Tier 2)
                folderId,
                status,
                urgencyLevel: 'medium',
                dateAdded: date ? date.toISOString() : new Date().toISOString(),
                tags: [],
            };

            const newProcurement = await addProcurement(
                procurementData,
                user?.email || 'unknown@example.com',
                user?.name || 'Unknown User'
            );

            // If the file is archived, calculate and assign stack number
            if (status === 'archived') {
                const filesInFolder = procurements
                    .filter(p => p.folderId === folderId && p.status === 'archived')
                    .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

                const stackNumber = filesInFolder.length + 1;
                await updateProcurement(newProcurement.id, { stackNumber });
            }

            toast.success('File record added successfully');
            navigate('/dashboard');
        } catch (error: any) {
            toast.error(error.message || 'Failed to add file record');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle PR Number: uppercase, no auto-formatting
    const handlePRNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPrNumber(e.target.value.toUpperCase());
    };

    // Resolve display names for selected location
    const selectedShelfName = cabinets.find(c => c.id === shelfId);
    const selectedCabinetName = availableCabinets.find(s => s.id === cabinetId);
    const selectedFolderName = availableFolders.find(f => f.id === folderId);

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-white">Add New Procurement</h1>
                <p className="text-slate-400 mt-1">Create a new procurement record and track its location</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-1">
                    <div className="space-y-6">

                        {/* ── Basic Information ── */}
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Basic Information</h3>
                                    <p className="text-sm text-slate-400">Essential details about the procurement</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">PR Number * (Division-Month-Year-Number)</Label>
                                        <Input
                                            placeholder="DIV-JAN-26-001"
                                            value={prNumber}
                                            onChange={handlePRNumberChange}
                                            className="bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500 uppercase"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Date Added</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal bg-[#1e293b] border-slate-700 text-white hover:bg-[#253045]"
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 bg-[#1e293b] border-slate-700">
                                                <Calendar
                                                    mode="single"
                                                    selected={date}
                                                    onSelect={setDate}
                                                    initialFocus
                                                    className="bg-[#1e293b] text-white"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Description *</Label>
                                    <Textarea
                                        placeholder="Describe the items or services..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500 min-h-[100px]"
                                        required
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* ── Physical Location & Status ── */}
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Physical Location</h3>
                                    <p className="text-sm text-slate-400">Shelf → Cabinet → Folder</p>
                                </div>

                                {/* Cascading dropdowns */}
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Shelf *</Label>
                                        <Select value={shelfId} onValueChange={setShelfId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select shelf" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {cabinets.map((shelf) => (
                                                    <SelectItem key={shelf.id} value={shelf.id} className="text-white">
                                                        {shelf.code} - {shelf.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Cabinet *</Label>
                                        <Select value={cabinetId} onValueChange={setCabinetId} disabled={!shelfId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select cabinet" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {availableCabinets.map((cabinet) => (
                                                    <SelectItem key={cabinet.id} value={cabinet.id} className="text-white">
                                                        {cabinet.code} - {cabinet.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Folder *</Label>
                                        <Select value={folderId} onValueChange={setFolderId} disabled={!cabinetId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select folder" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {availableFolders.map((folder) => (
                                                    <SelectItem key={folder.id} value={folder.id} className="text-white">
                                                        {folder.code} - {folder.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Location summary + Stack Number preview — shown once folder is selected */}
                                {folderId && selectedShelfName && selectedCabinetName && selectedFolderName && (
                                    <div className="rounded-lg border border-slate-700 bg-[#1e293b] p-4 space-y-3">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                                            Location Summary
                                        </p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-mono bg-slate-700 text-slate-200 px-2 py-1 rounded">
                                                {selectedShelfName.code}
                                            </span>
                                            <span className="text-slate-500 text-xs">→</span>
                                            <span className="text-xs font-mono bg-slate-700 text-slate-200 px-2 py-1 rounded">
                                                {selectedCabinetName.code}
                                            </span>
                                            <span className="text-slate-500 text-xs">→</span>
                                            <span className="text-xs font-mono bg-slate-700 text-slate-200 px-2 py-1 rounded">
                                                {selectedFolderName.code}
                                            </span>
                                        </div>

                                        {/* Stack number preview — only shown when status is Archived */}
                                        {status === 'archived' && previewStackNumber !== null && (
                                            <div className="flex items-center gap-3 pt-1 border-t border-slate-700 mt-2">
                                                <div className="flex items-center gap-2 text-slate-300">
                                                    <Layers className="h-4 w-4 text-emerald-400" />
                                                    <span className="text-sm font-medium text-white">Stack Position</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl font-bold text-emerald-400">
                                                        #{previewStackNumber}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        {previewStackNumber === 1
                                                            ? '(First file in this folder)'
                                                            : `(After ${previewStackNumber - 1} existing file${previewStackNumber - 1 > 1 ? 's' : ''})`}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Info when status is Borrowed — no stack number assigned */}
                                        {status === 'active' && (
                                            <div className="flex items-center gap-2 pt-1 border-t border-slate-700 mt-2 text-slate-400">
                                                <Layers className="h-4 w-4" />
                                                <span className="text-xs">
                                                    No stack number assigned — file is marked as Borrowed
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Status */}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Current Status</Label>
                                    <Select value={status} onValueChange={(val) => setStatus(val as ProcurementStatus)}>
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700">
                                            <SelectItem value="active" className="text-white">Borrowed</SelectItem>
                                            <SelectItem value="archived" className="text-white">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Save Record
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                    </div>
                </div>
            </form>
        </div>
    );
};

export default AddProcurement;