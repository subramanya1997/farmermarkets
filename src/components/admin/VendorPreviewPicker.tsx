import { Eye } from 'lucide-react';
import { startVendorPreviewAction, startVendorPreviewFormAction } from '@/app/(app)/vendor/actions';
import { VENDOR_PREVIEW_NEW, type AdminVendorRow } from '@/lib/vendors';
import { Panel } from '@/components/admin/bits';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Only admins see this, on the vendor desk: pick a vendor to see their desk
 * the way they do, or see the first screen a new vendor gets. Read only.
 */
export function VendorPreviewPicker({ vendors }: { vendors: Pick<AdminVendorRow, 'id' | 'name' | 'email'>[] }) {
  return (
    <Panel title="Preview as a vendor">
      <div className="space-y-3 px-4 py-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Only admins see this. See the vendor desk the way a vendor does. Nothing you do in a preview is saved.
        </p>
        {vendors.length > 0 ? (
          <form action={startVendorPreviewFormAction} className="flex flex-col gap-2 sm:flex-row">
            <Select name="vendor" defaultValue={vendors[0].id}>
              <SelectTrigger aria-label="Vendor" className="h-11 w-full sm:h-9 sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name || vendor.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="h-11 bg-green-700 hover:bg-green-800 sm:h-9">
              <Eye aria-hidden="true" />
              Preview
            </Button>
          </form>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No vendors have signed up yet.</p>
        )}
        <form action={startVendorPreviewAction.bind(null, VENDOR_PREVIEW_NEW)}>
          <Button type="submit" variant="outline" className="h-11 w-full sm:h-9 sm:w-auto">
            See what a new vendor sees
          </Button>
        </form>
      </div>
    </Panel>
  );
}
