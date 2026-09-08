"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import {
  EXPORT_COLUMNS,
  EXPORT_COLUMN_LABELS,
  ExportColumn,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useState } from "react"

const DEFAULT_COLUMNS = EXPORT_COLUMNS.filter((column) => column !== "last4")

export function ExportOptionsDialog({
  filterQuery,
  currentTotal,
  allTotal,
}: {
  /** The query string for the filters currently active on screen. */
  filterQuery: string
  currentTotal: number
  allTotal: number
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<ExportColumn>>(
    () => new Set(DEFAULT_COLUMNS),
  )
  const [scope, setScope] = useState<"current" | "all">("current")

  const toggleColumn = (column: ExportColumn) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  const hasColumns = selected.size > 0
  const rowCount = scope === "current" ? currentTotal : allTotal

  const exportHref = (() => {
    const params = new URLSearchParams(scope === "current" ? filterQuery : "")
    params.set("scope", scope)
    params.set(
      "columns",
      EXPORT_COLUMNS.filter((column) => selected.has(column)).join(","),
    )
    return `/api/payments/export?${params.toString()}`
  })()

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose which columns and how many rows to include.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            {EXPORT_COLUMNS.map((column) => {
              const inputId = `export-column-${column}`
              return (
                <label
                  key={column}
                  htmlFor={inputId}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={selected.has(column)}
                    onChange={() => toggleColumn(column)}
                    className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
                  />
                  {EXPORT_COLUMN_LABELS[column]}
                </label>
              )
            })}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <label
              htmlFor="export-scope-current"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                id="export-scope-current"
                type="radio"
                name="export-scope"
                checked={scope === "current"}
                onChange={() => setScope("current")}
                className="size-4 border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
              />
              Current filter
            </label>
            <label
              htmlFor="export-scope-all"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                id="export-scope-all"
                type="radio"
                name="export-scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="size-4 border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
              />
              All payments
            </label>
          </fieldset>

          <p className="text-sm text-gray-500">
            {rowCount.toLocaleString()}{" "}
            {rowCount === 1 ? "payment" : "payments"} will be exported.
          </p>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DrawerClose>
          <Button asChild={hasColumns} disabled={!hasColumns}>
            {hasColumns ? (
              <a href={exportHref} onClick={() => setOpen(false)}>
                Download
              </a>
            ) : (
              <span>Download</span>
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
