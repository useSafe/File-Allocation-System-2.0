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
import { Loader2, Save, CalendarIcon } from 'lucide-react';
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
    
    // Get data from context
    // NOTE: Variable names are confusing - they're swapped!
    // cabinets array actually contains SHELVES (Tier 1)
    // shelves array actually contains CABINETS (Tier 2)
    // folders array contains FOLDERS (Tier 3)
    const { cabinets, shelves, folders, procurements } = useData();

    // For clarity, let's create properly named variables
    const actualShelves = cabinets;  // cabinets table stores Shelves
    const actualCabinets = shelves;  // shelves table stores Cabinets
    const actualFolders = folders;   // folders table stores Folders

    // Filtered location options based on selection
    const [availableCabinets, setAvailableCabinets] = useState<Shelf[]>([]);
    const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);

    // Form State
    // NOTE: These IDs are also confusing due to database design
    // cabinetId actually stores the selected SHELF's ID
    // shelfId actually stores the selected CABINET's ID
    // folderId stores the selected FOLDER's ID
    const [prNumber, setPrNumber] = useState('');
    const [description, setDescription] = useState('');
    const [selectedShelfId, setSelectedShelfId] = useState('');  // This is cabinetId in DB
    const [selectedCabinetId, setSelectedCabinetId] = useState('');  // This is shelfId in DB
    const [selectedFolderId, setSelectedFolderId] = useState('');  // This is folderId in DB
    const [status, setStatus] = useState<ProcurementStatus>('active');
    const [date, setDate] = useState<Date | undefined>(new Date());

    // Update available cabinets when shelf changes
    useEffect(() => {
        if (selectedShelfId) {
            // Filter cabinets that belong to the selected shelf
            // actualCabinets have a cabinetId field that should match our selectedShelfId
            setAvailableCabinets(actualCabinets.filter(c => c.cabinetId === selectedShelfId));
            setSelectedCabinetId('');
            setSelectedFolderId('');
        } else {
            setAvailableCabinets([]);
        }
    }, [selectedShelfId, actualCabinets]);

    // Update available folders when cabinet changes
    useEffect(() => {
        if (selectedCabinetId) {
            // Filter folders that belong to the selected cabinet
            // actualFolders have a shelfId field that should match our selectedCabinetId
            setAvailableFolders(actualFolders.filter(f => f.shelfId === selectedCabinetId));
            setSelectedFolderId('');
        } else {
            setAvailableFolders([]);
        }
    }, [selectedCabinetId, actualFolders]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prNumber || !description || !selectedShelfId || !selectedCabinetId || !selectedFolderId) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        try {
            const procurementData: any = {
                prNumber,
                description,
                // Map our clear variable names to the confusing DB field names
                cabinetId: selectedShelfId,      // DB's cabinetId stores shelf
                shelfId: selectedCabinetId,       // DB's shelfId stores cabinet
                folderId: selectedFolderId,       // This one is correct
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
                    .filter(p => p.folderId === selectedFolderId && p.status === 'archived')
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

    // Free-form PR Number input - only uppercase conversion
    const handlePRNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase();
        setPrNumber(value);
    };

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-white">
                    Add New Procurement
                </h1>
                <p className="text-slate-400 mt-1">Create a new procurement record and track its location</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-1">
                    <div className="space-y-6">
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Basic Information</h3>
                                    <p className="text-sm text-slate-400">Essential details about the procurement</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">PR Number (Division-Month-Year-Number) *</Label>
                                        <Input
                                            placeholder="e.g., DIV-JAN-26-001"
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

                        {/* Physical Location & Status */}
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Physical Location</h3>
                                    <p className="text-sm text-slate-400">Shelf → Cabinet → Folder</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Shelf *</Label>
                                        <Select value={selectedShelfId} onValueChange={setSelectedShelfId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select shelf" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {actualShelves.map((shelf) => (
                                                    <SelectItem key={shelf.id} value={shelf.id} className="text-white">
                                                        {shelf.code} - {shelf.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Cabinet *</Label>
                                        <Select 
                                            value={selectedCabinetId} 
                                            onValueChange={setSelectedCabinetId} 
                                            disabled={!selectedShelfId}
                                        >
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
                                        <Select 
                                            value={selectedFolderId} 
                                            onValueChange={setSelectedFolderId} 
                                            disabled={!selectedCabinetId}
                                        >
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