import { useAppStore } from '@/lib/store';
import { Dialog, Button } from '@/components/ui/primitives';

export function ExportDialog() {
  const { isExportOpen, setIsExportOpen, result } = useAppStore();

  if (!result) return null;

  return (
    <Dialog 
      open={isExportOpen} 
      onClose={() => setIsExportOpen(false)} 
      title="Session Export Center"
      description="Download or copy your session intelligence for archival and external workflows."
    >
      <div className="grid grid-cols-2 gap-4">
        <Button variant="secondary" size="lg" onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}>
          Copy Full JSON
        </Button>
        <Button variant="secondary" size="lg" onClick={() => navigator.clipboard.writeText(result.summary)}>
          Copy Summary
        </Button>
        <Button variant="secondary" size="lg" className="col-span-2">
          Download Intelligence Report (.md)
        </Button>
      </div>
      <div className="mt-8 pt-6 border-t border-white/5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Signed External Share Link
        </p>
        <input 
          readOnly 
          value={`https://voice-action.local/share/${result.meta.requestId}`} 
          className="w-full rounded-lg bg-black/40 border border-white/10 p-3 text-xs text-zinc-400 focus:outline-none" 
        />
      </div>
    </Dialog>
  );
}