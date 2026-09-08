import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import { exportFilename, parseColumns, toCsv } from "@/lib/csv"
import { NextRequest } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Reuses the query builder for both scopes. Columns and scope are validated
 * server-side: an unrecognized column name is dropped rather than passed
 * through (parseColumns), and an empty resulting column list is rejected
 * rather than silently producing a header-only file.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filters = parseFilters(params)
  const scope = params.get("scope") === "all" ? "all" : "current"
  const columns = parseColumns(params.get("columns"))

  if (columns.length === 0) {
    return new Response("Select at least one column to export.", {
      status: 400,
    })
  }

  const effectiveFilters = scope === "all" ? {} : filters
  const rows = sortPayments(
    filterPayments(effectiveFilters),
    filters.sort,
    filters.direction,
  )

  const slug =
    scope === "all" ? "all" : filters.status !== "all" ? filters.status : undefined

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(new Date(), slug)}"`,
    },
  })
}
