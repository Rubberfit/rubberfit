"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Star, Building } from "lucide-react";
import { cn } from "@/lib/utils";

import { type Supplier } from "@/lib/supabase";
import { supplierService } from "@/services/supplierService";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface SupplierSelectionProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showRating?: boolean;
  filterActive?: boolean;
  filterPreferred?: boolean;
}

export function SupplierSelection({
  value,
  onValueChange,
  placeholder = "Select supplier...",
  disabled = false,
  className,
  showRating = true,
  filterActive = true,
  filterPreferred = false,
}: SupplierSelectionProps) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, [filterActive, filterPreferred]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const data = await supplierService.getSuppliers({
        filterActive,
        filterPreferred,
      });
      setSuppliers(data);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  const selectedSupplier = suppliers.find((s) => s.id === value);

  const renderRatingStars = (rating: number | null | undefined) => {
    if (!rating || !showRating) return null;

    return (
      <div className="flex gap-0.5 ml-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating
                ? "fill-yellow-500 text-yellow-500"
                : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const renderSupplierLabel = (supplier: Supplier) => {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center">
          <span>{supplier.name}</span>
          {supplier.preferred && (
            <Badge variant="secondary" className="ml-2 h-5">
              <Star className="h-3 w-3 mr-1" />
              Preferred
            </Badge>
          )}
        </div>
        {showRating && renderRatingStars(supplier.rating)}
      </div>
    );
  };

  // Group suppliers by preferred status
  const preferredSuppliers = suppliers.filter((s) => s.preferred);
  const regularSuppliers = suppliers.filter((s) => !s.preferred);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between min-h-[44px]",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          {value ? (
            <div className="flex items-center">
              <Building className="mr-2 h-4 w-4" />
              {selectedSupplier?.name}
              {selectedSupplier?.preferred && (
                <Badge variant="secondary" className="ml-2 h-5">
                  <Star className="h-3 w-3" />
                </Badge>
              )}
            </div>
          ) : (
            <span className="flex items-center">
              <Building className="mr-2 h-4 w-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Search suppliers..." className="h-9" />
          <CommandEmpty>
            {loading ? "Loading suppliers..." : "No supplier found."}
          </CommandEmpty>
          {preferredSuppliers.length > 0 && (
            <CommandGroup heading="Preferred Suppliers">
              {preferredSuppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={supplier.name}
                  onSelect={() => {
                    onValueChange(supplier.id);
                    setOpen(false);
                  }}
                  className="flex items-center"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === supplier.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {renderSupplierLabel(supplier)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {regularSuppliers.length > 0 && (
            <CommandGroup
              heading={preferredSuppliers.length > 0 ? "Other Suppliers" : "All Suppliers"}
            >
              {regularSuppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={supplier.name}
                  onSelect={() => {
                    onValueChange(supplier.id);
                    setOpen(false);
                  }}
                  className="flex items-center"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === supplier.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {renderSupplierLabel(supplier)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Export a simple dropdown version for forms
export function SupplierSelect({
  value,
  onValueChange,
  placeholder = "Select supplier",
  disabled = false,
  className,
  required = false,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const data = await supplierService.getActiveSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  const preferredSuppliers = suppliers.filter((s) => s.preferred);
  const regularSuppliers = suppliers.filter((s) => !s.preferred);

  return (
    <select
      value={value || ""}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled || loading}
      required={required}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "min-h-[44px]",
        className
      )}
    >
      <option value="">{loading ? "Loading..." : placeholder}</option>
      {preferredSuppliers.length > 0 && (
        <optgroup label="Preferred Suppliers">
          {preferredSuppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              ⭐ {supplier.name}
            </option>
          ))}
        </optgroup>
      )}
      {regularSuppliers.length > 0 && (
        <optgroup label={preferredSuppliers.length > 0 ? "Other Suppliers" : "All Suppliers"}>
          {regularSuppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}