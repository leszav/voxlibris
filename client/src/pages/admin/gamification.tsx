import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import {
  Blocks,
  ChevronsUpDown,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AchievementStatus = "draft" | "active" | "archived";
type IconType = "badge" | "star" | "title";
type ValueType = "number" | "string" | "boolean";
type ConditionPrimitiveValue = boolean | number | string;
type ConditionsFormFields = "conditionsLogic" | "conditions";
type ParsedConditionsForm = Pick<AchievementFormState, ConditionsFormFields>;
type RewardInputValue = number | string | null;
type ConditionsLogic = "AND" | "OR";
type AssetTypeFilter = "all" | IconType;
type AssetSortBy = "nameRu" | "createdAt" | "sortOrder" | "groupKey";
type SortDirection = "asc" | "desc";

interface AchievementItem {
  id: string;
  code: string;
  titleRu: string;
  descriptionRu: string | null;
  iconType: IconType;
  badgeImageUrl: string | null;
  rewardPayload: unknown;
  conditionsPayload: unknown;
  status: AchievementStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface BuildingBlockItem {
  id: string;
  code: string;
  labelRu: string;
  valueType: ValueType;
  supportedOperators: string[];
  sourceKey?: string | null;
  isActive: boolean;
}

interface FieldRegistryItem {
  key: string;
  type: ValueType;
  label: string;
  group: string;
}

interface FieldRegistryResponse {
  success: boolean;
  registry: Record<string, FieldRegistryItem[]>;
}

interface RewardAssetItem {
  id: string;
  assetType: IconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu: string | null;
  groupKey: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RewardAssetFormState {
  assetType: IconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu: string;
  groupKey: string;
  tagsText: string;
  sortOrder: string;
  isActive: boolean;
}

interface AchievementFormState {
  code: string;
  titleRu: string;
  descriptionRu: string;
  iconType: IconType;
  badgeImageUrl: string;
  rewardTitleRu: string;
  rewardDescriptionRu: string;
  rewardValue: string;
  conditionsLogic: ConditionsLogic;
  conditions: AchievementConditionFormState[];
  status: AchievementStatus;
  sortOrder: string;
}

interface AchievementConditionFormState {
  id: string;
  blockCode: string;
  operator: string;
  valueType: ValueType;
  value: string;
}

interface BuildingBlockFormState {
  code: string;
  labelRu: string;
  sourceKey: string;
  valueType: ValueType;
  supportedOperators: string[];
  isActive: boolean;
}

const OPERATOR_OPTIONS_BY_VALUE_TYPE: Record<ValueType, string[]> = {
  number: [">", ">=", "=", "!=", "<", "<=", "IN", "NOT IN"],
  string: ["=", "!=", "IN", "NOT IN", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH"],
  boolean: ["=", "!="],
};

const OPERATOR_HELP: Record<string, string> = {
  ">": "Больше чем. Пример: completed_books > 5",
  ">=": "Больше или равно. Пример: tenure_days >= 30",
  "=": "Равно. Пример: profile_completed = true",
  "!=": "Не равно. Пример: favorite_genre != Драма",
  "<": "Меньше чем. Пример: sent_dm_count < 10",
  "<=": "Меньше или равно. Пример: current_streak_days <= 3",
  "IN": "Входит в список. Пример: favorite_genre IN Фантастика,Фэнтези",
  "NOT IN": "Не входит в список. Пример: favorite_genre NOT IN Драма,Ужасы",
  "CONTAINS": "Содержит подстроку. Пример: favorite_genre CONTAINS Детские",
  "NOT CONTAINS": "Не содержит подстроку. Пример: favorite_genre NOT CONTAINS 18+",
  "STARTS WITH": "Начинается с. Пример: favorite_genre STARTS WITH Детские",
  "ENDS WITH": "Заканчивается на. Пример: favorite_genre ENDS WITH фика",
};

const ACHIEVEMENT_STATUS_LABELS: Record<AchievementStatus, string> = {
  draft: "Черновик",
  active: "Активно",
  archived: "В архиве",
};

const ICON_TYPE_LABELS: Record<IconType, string> = {
  badge: "Бейдж",
  star: "Звезда",
  title: "Титул",
};

const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  number: "Число",
  string: "Строка",
  boolean: "Да/нет",
};

const STAR_REWARD_OPTIONS = ["1", "2", "3", "4", "5"] as const;

const TARGET_ASSET_SIZE = 256;
const ASSET_WEBP_QUALITY = 0.9;

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertFileToWebpDataUrl(file: File): Promise<string> {
  const image = await loadImageFromFile(file);

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_ASSET_SIZE;
  canvas.height = TARGET_ASSET_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось создать контекст изображения");
  }

  const scale = Math.min(TARGET_ASSET_SIZE / image.width, TARGET_ASSET_SIZE / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.round((TARGET_ASSET_SIZE - drawWidth) / 2);
  const offsetY = Math.round((TARGET_ASSET_SIZE - drawHeight) / 2);

  context.clearRect(0, 0, TARGET_ASSET_SIZE, TARGET_ASSET_SIZE);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const output = canvas.toDataURL("image/webp", ASSET_WEBP_QUALITY);
  if (!output.startsWith("data:image/webp")) {
    throw new Error("Браузер не поддерживает конвертацию в WebP");
  }

  return output;
}

function fileNameToAssetTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Новый ассет";
}

const EMPTY_ACHIEVEMENT_FORM: AchievementFormState = {
  code: "",
  titleRu: "",
  descriptionRu: "",
  iconType: "badge",
  badgeImageUrl: "",
  rewardTitleRu: "",
  rewardDescriptionRu: "",
  rewardValue: "",
  conditionsLogic: "AND",
  conditions: [],
  status: "draft",
  sortOrder: "0",
};

const EMPTY_BLOCK_FORM: BuildingBlockFormState = {
  code: "",
  labelRu: "",
  sourceKey: "",
  valueType: "number",
  supportedOperators: [">=", "<=", "="],
  isActive: true,
};
const EMPTY_REWARD_ASSET_FORM: RewardAssetFormState = {
  assetType: "badge",
  nameRu: "",
  imageUrl: "",
  descriptionRu: "",
  groupKey: "default",
  tagsText: "",
  sortOrder: "0",
  isActive: true,
};

async function fetchAchievements(status: string): Promise<AchievementItem[]> {
  const params = new URLSearchParams();
  if (status !== "all") {
    params.set("status", status);
  }

  const query = params.toString();
  const response = await apiRequest<{ success: boolean; achievements: AchievementItem[] }>(
    query ? `/api/admin/gamification/achievements?${query}` : "/api/admin/gamification/achievements",
  );
  return response.achievements;
}

async function fetchBuildingBlocks(includeInactive: boolean): Promise<BuildingBlockItem[]> {
  const params = new URLSearchParams({ includeInactive: String(includeInactive) });
  const response = await apiRequest<{ success: boolean; blocks: BuildingBlockItem[] }>(
    `/api/admin/gamification/building-blocks?${params.toString()}`,
  );
  return response.blocks;
}

async function fetchRewardAssets(includeInactive: boolean): Promise<RewardAssetItem[]> {
  const params = new URLSearchParams({ includeInactive: String(includeInactive) });
  const response = await apiRequest<{ success: boolean; assets: RewardAssetItem[] }>(
    `/api/admin/gamification/reward-assets?${params.toString()}`,
  );
  return response.assets;
}

// Этап 7: Функции для ручного пересчёта
async function runReconcile(): Promise<{ success: boolean; summary: unknown }> {
  const response = await apiRequest<{ success: boolean; summary: unknown }>(
    "/api/admin/gamification/reconcile/run",
    {
      method: "POST",
      body: JSON.stringify({ batchSize: 100 }),
    },
  );
  return response;
}

let conditionIdCounter = 0;

function createConditionId(): string {
  conditionIdCounter += 1;
  return `condition-${conditionIdCounter}`;
}

function createEmptyCondition(): AchievementConditionFormState {
  return {
    id: createConditionId(),
    blockCode: "",
    operator: ">=",
    valueType: "number",
    value: "",
  };
}

function parseConditionValue(valueType: ValueType, rawValue: string): ConditionPrimitiveValue {
  if (valueType === "boolean") {
    return rawValue === "true";
  }

  if (valueType === "number") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw new TypeError("Числовое условие должно содержать корректное число");
    }
    return parsed;
  }

  return rawValue.trim();
}

function normalizeConditionValue(valueType: ValueType, value: unknown): string {
  if (valueType === "boolean") {
    return value ? "true" : "false";
  }
  if (valueType === "number") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  return typeof value === "string" ? value : "";
}

function parseConditionsPayload(payload: unknown): ParsedConditionsForm {
  const fallback = {
    conditionsLogic: "AND" as ConditionsLogic,
    conditions: [] as AchievementConditionFormState[],
  };

  if (!payload) {
    return fallback;
  }

  let rawItems: unknown[] = [];
  if (Array.isArray(payload)) {
    rawItems = payload;
  } else if (typeof payload === "object" && payload !== null) {
    const candidateItems = (payload as { items?: unknown[] }).items;
    if (Array.isArray(candidateItems)) {
      rawItems = candidateItems;
    }
  }

  const rawLogic =
    typeof payload === "object" && payload !== null && (payload as { logic?: unknown }).logic === "OR"
      ? "OR"
      : "AND";

  const conditions = rawItems.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as {
      blockCode?: unknown;
      operator?: unknown;
      valueType?: unknown;
      value?: unknown;
    };

    if (typeof candidate.blockCode !== "string" || typeof candidate.operator !== "string") {
      return [];
    }

    const valueType: ValueType =
      candidate.valueType === "string" || candidate.valueType === "boolean" ? candidate.valueType : "number";

    return [{
      id: createConditionId(),
      blockCode: candidate.blockCode,
      operator: candidate.operator,
      valueType,
      value: normalizeConditionValue(valueType, candidate.value),
    }];
  });

  return {
    conditionsLogic: rawLogic,
    conditions,
  };
}

function stringifyRewardValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function parseRewardPayload(payload: unknown, iconType: IconType, badgeImageUrl: string | null) {
  const rawPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  return {
    rewardTitleRu: typeof rawPayload.titleRu === "string" ? rawPayload.titleRu : "",
    rewardDescriptionRu: typeof rawPayload.descriptionRu === "string" ? rawPayload.descriptionRu : "",
    rewardValue: stringifyRewardValue(rawPayload.value),
    badgeImageUrl: typeof rawPayload.badgeImageUrl === "string" ? rawPayload.badgeImageUrl : (badgeImageUrl ?? ""),
    iconType,
  };
}

function formatConditionPreview(condition: AchievementConditionFormState, block?: BuildingBlockItem): string {
  const label = block?.labelRu ?? (condition.blockCode || "Параметр");
  let value = condition.value;
  if (condition.valueType === "boolean") {
    value = condition.value === "true" ? "Да" : "Нет";
  }
  return `${label} ${condition.operator} ${value || "—"}`;
}

function parseRewardValueInput(rewardValue: string): RewardInputValue {
  const trimmed = rewardValue.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return trimmed;
}

function summarizeConditions(
  conditions: AchievementConditionFormState[],
  logic: ConditionsLogic,
  blockByCode: Map<string, BuildingBlockItem>,
): string {
  if (conditions.length === 0) {
    return "Без условий";
  }

  const parts = conditions.map((condition) => formatConditionPreview(condition, blockByCode.get(condition.blockCode)));
  if (parts.length === 1) {
    return parts[0];
  }

  const preview = parts.slice(0, 2).join(` ${logic} `);
  if (parts.length > 2) {
    return `${preview} и еще ${parts.length - 2}`;
  }

  return preview;
}

function summarizeAchievementRule(item: AchievementItem, blockByCode: Map<string, BuildingBlockItem>): string {
  const parsed = parseConditionsPayload(item.conditionsPayload);
  return summarizeConditions(parsed.conditions, parsed.conditionsLogic, blockByCode);
}

function describeRewardValue(iconType: IconType, rewardValue: string): string {
  if (!rewardValue.trim()) {
    return "не задано";
  }

  if (iconType === "star") {
    return `${rewardValue} звезд`;
  }

  if (iconType === "title") {
    return rewardValue;
  }

  return "визуальный бейдж";
}

function getDefaultRewardValue(iconType: IconType, currentValue: string): string {
  if (iconType === "badge") {
    return "";
  }

  if (iconType === "star") {
    return STAR_REWARD_OPTIONS.includes(currentValue as typeof STAR_REWARD_OPTIONS[number]) ? currentValue : "1";
  }

  return currentValue;
}

function getConditionValuePlaceholder(condition: AchievementConditionFormState): string {
  if (condition.valueType === "number") {
    return "365";
  }

  if (condition.blockCode === "favorite_genre") {
    return "Напр.: Фантастика, Детские* или *";
  }

  return "Значение";
}

interface AchievementsTableProps {
  achievements: AchievementItem[];
  blockByCode: Map<string, BuildingBlockItem>;
  onEdit: (item: AchievementItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

function AchievementsTable({ achievements, blockByCode, onEdit, onDelete, deletePending }: Readonly<AchievementsTableProps>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Код</TableHead>
          <TableHead>Правило</TableHead>
          <TableHead>Тип награды</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Порядок</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {achievements.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div>
                <div className="font-medium text-gray-900">{item.titleRu}</div>
                {item.descriptionRu ? (
                  <div className="mt-1 text-xs text-gray-500">{item.descriptionRu}</div>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{item.code}</TableCell>
            <TableCell className="max-w-72 text-sm text-gray-600">{summarizeAchievementRule(item, blockByCode)}</TableCell>
            <TableCell>{ICON_TYPE_LABELS[item.iconType]}</TableCell>
            <TableCell>
              <AchievementStatusBadge status={item.status} />
            </TableCell>
            <TableCell>{item.sortOrder}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => onDelete(item.id)}
                  disabled={deletePending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface BlocksTableProps {
  blocks: BuildingBlockItem[];
  onEdit: (item: BuildingBlockItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

function BlocksTable({ blocks, onEdit, onDelete, deletePending }: Readonly<BlocksTableProps>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Код</TableHead>
          <TableHead>Тип значения</TableHead>
          <TableHead>Операторы</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {blocks.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium text-gray-900">{item.labelRu}</TableCell>
            <TableCell className="font-mono text-xs">{item.code}</TableCell>
            <TableCell>{VALUE_TYPE_LABELS[item.valueType]}</TableCell>
            <TableCell className="font-mono text-xs">{item.supportedOperators.join(", ")}</TableCell>
            <TableCell>
              <BuildingBlockStatusBadge isActive={item.isActive} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => onDelete(item.id)}
                  disabled={deletePending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function achievementToForm(item: AchievementItem): AchievementFormState {
  const parsedConditions = parseConditionsPayload(item.conditionsPayload);
  const parsedReward = parseRewardPayload(item.rewardPayload, item.iconType, item.badgeImageUrl);

  return {
    code: item.code,
    titleRu: item.titleRu,
    descriptionRu: item.descriptionRu ?? "",
    iconType: parsedReward.iconType,
    badgeImageUrl: parsedReward.badgeImageUrl,
    rewardTitleRu: parsedReward.rewardTitleRu,
    rewardDescriptionRu: parsedReward.rewardDescriptionRu,
    rewardValue: parsedReward.rewardValue,
    conditionsLogic: parsedConditions.conditionsLogic,
    conditions: parsedConditions.conditions,
    status: item.status,
    sortOrder: String(item.sortOrder),
  };
}

function blockToForm(item: BuildingBlockItem): BuildingBlockFormState {
  return {
    code: item.code,
    labelRu: item.labelRu,
    sourceKey: item.sourceKey ?? "",
    valueType: item.valueType,
    supportedOperators: item.supportedOperators,
    isActive: item.isActive,
  };
}

function sourceKeyToCode(sourceKey: string): string {
  const parts = sourceKey.split(".");
  return parts.at(-1) ?? sourceKey;
}

function AchievementStatusBadge({ status }: Readonly<{ status: AchievementStatus }>) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (status === "active") {
    className = "bg-green-50 text-green-700 border-green-200";
  } else if (status === "draft") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  return (
    <Badge variant="secondary" className={className}>
      {ACHIEVEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

function BuildingBlockStatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge
      variant="secondary"
      className={isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-700 border-slate-200"}
    >
      {isActive ? "Активен" : "Выключен"}
    </Badge>
  );
}

// Helper to update selected asset IDs
function getUpdatedAssetIds(prev: string[], assetId: string, checked: boolean): string[] {
  if (checked) {
    return prev.includes(assetId) ? prev : [...prev, assetId];
  }
  return prev.filter((id) => id !== assetId);
}

// Reward Assets Gallery Content Component
interface RewardAssetsGalleryContentProps {
  groupAssetsByKey: boolean;
  groupedRewardAssets: [string, RewardAssetItem[]][];
  filteredRewardAssets: RewardAssetItem[];
  selectedAssetIds: string[];
  onAssetSelect: (assetId: string, checked: boolean) => void;
  onEditAsset: (asset: RewardAssetItem) => void;
  onDeleteAsset: (id: string) => void;
  deletePending: boolean;
}

function RewardAssetsGalleryContent({
  groupAssetsByKey,
  groupedRewardAssets,
  filteredRewardAssets,
  selectedAssetIds,
  onAssetSelect,
  onEditAsset,
  onDeleteAsset,
  deletePending,
}: Readonly<RewardAssetsGalleryContentProps>) {
  if (groupAssetsByKey) {
    return (
      <div className="space-y-4">
        {groupedRewardAssets.map(([groupKey, items]) => (
          <div key={groupKey} className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <p className="font-medium">Группа: {groupKey}</p>
              <p className="text-xs text-muted-foreground">{items.length} шт.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Превью</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Теги</TableHead>
                  <TableHead>Порядок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((asset) => {
                  const selected = selectedAssetIds.includes(asset.id);
                  return (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            onAssetSelect(asset.id, event.target.checked);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <AchievementImagePreview
                          src={asset.imageUrl}
                          alt={asset.nameRu}
                          triggerClassName="h-10 w-10 border"
                          imageClassName="rounded"
                        />
                      </TableCell>
                      <TableCell>{asset.nameRu}</TableCell>
                      <TableCell>{ICON_TYPE_LABELS[asset.assetType]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{asset.tags.join(", ") || "-"}</TableCell>
                      <TableCell>{asset.sortOrder}</TableCell>
                      <TableCell>
                        <Badge variant={asset.isActive ? "default" : "secondary"}>{asset.isActive ? "active" : "inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => onEditAsset(asset)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => onDeleteAsset(asset.id)} disabled={deletePending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Превью</TableHead>
          <TableHead>Название</TableHead>
          <TableHead>Группа</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead>Теги</TableHead>
          <TableHead>Порядок</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredRewardAssets.map((asset) => {
          const selected = selectedAssetIds.includes(asset.id);
          return (
            <TableRow key={asset.id}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => {
                    onAssetSelect(asset.id, event.target.checked);
                  }}
                />
              </TableCell>
              <TableCell>
                <AchievementImagePreview
                  src={asset.imageUrl}
                  alt={asset.nameRu}
                  triggerClassName="h-10 w-10 border"
                  imageClassName="rounded"
                />
              </TableCell>
              <TableCell>{asset.nameRu}</TableCell>
              <TableCell>{asset.groupKey}</TableCell>
              <TableCell>{ICON_TYPE_LABELS[asset.assetType]}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{asset.tags.join(", ") || "-"}</TableCell>
              <TableCell>{asset.sortOrder}</TableCell>
              <TableCell>
                <Badge variant={asset.isActive ? "default" : "secondary"}>{asset.isActive ? "active" : "inactive"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEditAsset(asset)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDeleteAsset(asset.id)} disabled={deletePending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function TableSkeleton() {
  const rows = ["1", "2", "3", "4"];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Skeleton key={row} className="h-14 w-full" />
      ))}
    </div>
  );
}

interface GamificationStatsProps {
  achievementSummary: { total: number; active: number; draft: number };
  rewardAssetsSummary: { total: number; active: number };
}

function GamificationStats({ achievementSummary, rewardAssetsSummary }: Readonly<GamificationStatsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">Всего достижений</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{achievementSummary.total}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">Активных достижений</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{achievementSummary.active}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">Черновиков</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{achievementSummary.draft}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">Ассетов галереи</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{rewardAssetsSummary.active}/{rewardAssetsSummary.total}</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface AchievementsTabContentProps {
  achievementStatusFilter: string;
  onStatusFilterChange: (value: string) => void;
  achievementsContent: React.ReactNode;
}

function AchievementsTabContent({ achievementStatusFilter, onStatusFilterChange, achievementsContent }: Readonly<AchievementsTabContentProps>) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Каталог достижений
          </CardTitle>
          <CardDescription>
            Здесь создаются и редактируются достижения, их условия и награды.
          </CardDescription>
        </div>

        <div className="w-full lg:w-56">
          <Label htmlFor="achievement-status-filter">Фильтр по статусу</Label>
          <Select value={achievementStatusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger id="achievement-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="draft">Черновик</SelectItem>
              <SelectItem value="active">Активно</SelectItem>
              <SelectItem value="archived">В архиве</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {achievementsContent}
      </CardContent>
    </Card>
  );
}

interface BlocksTabContentProps {
  includeInactiveBlocks: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
  blocksContent: React.ReactNode;
}

function BlocksTabContent({ includeInactiveBlocks, onIncludeInactiveChange, blocksContent }: Readonly<BlocksTabContentProps>) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Blocks className="h-5 w-5" />
            Параметры условий
          </CardTitle>
          <CardDescription>
            Базовые параметры, из которых администратор собирает условия достижений.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input
            id="include-inactive-blocks"
            type="checkbox"
            checked={includeInactiveBlocks}
            onChange={(event) => onIncludeInactiveChange(event.target.checked)}
          />
          <Label htmlFor="include-inactive-blocks" className="cursor-pointer">Показывать выключенные</Label>
        </div>
      </CardHeader>
      <CardContent>
        {blocksContent}
      </CardContent>
    </Card>
  );
}

interface GalleryTabContentProps {
  assetSearch: string;
  onAssetSearchChange: (value: string) => void;
  assetTypeFilter: AssetTypeFilter;
  onAssetTypeFilterChange: (value: AssetTypeFilter) => void;
  assetSortBy: AssetSortBy;
  onAssetSortByChange: (value: AssetSortBy) => void;
  assetSortDir: SortDirection;
  onAssetSortDirChange: (value: SortDirection) => void;
  groupAssetsByKey: boolean;
  onGroupAssetsByKeyChange: (value: boolean) => void;
  includeInactiveAssets: boolean;
  onIncludeInactiveAssetsChange: (value: boolean) => void;
  onBulkImportClick: () => void;
  selectedAssetIds: string[];
  onBulkDelete: () => void;
  bulkDeletePending: boolean;
  galleryContent: React.ReactNode;
}

function GalleryTabContent({
  assetSearch,
  onAssetSearchChange,
  assetTypeFilter,
  onAssetTypeFilterChange,
  assetSortBy,
  onAssetSortByChange,
  assetSortDir,
  onAssetSortDirChange,
  groupAssetsByKey,
  onGroupAssetsByKeyChange,
  includeInactiveAssets,
  onIncludeInactiveAssetsChange,
  onBulkImportClick,
  selectedAssetIds,
  onBulkDelete,
  bulkDeletePending,
  galleryContent,
}: Readonly<GalleryTabContentProps>) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>Галерея наград</CardTitle>
          <CardDescription>
            Полноценный реестр ассетов: поиск, сортировка, группировка, массовый импорт и удаление.
          </CardDescription>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder="Поиск по названию, группе, тегам"
            value={assetSearch}
            onChange={(event) => onAssetSearchChange(event.target.value)}
            className="lg:col-span-2"
          />
          <Select value={assetTypeFilter} onValueChange={(value: AssetTypeFilter) => onAssetTypeFilterChange(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="badge">Бейдж</SelectItem>
              <SelectItem value="star">Звезда</SelectItem>
              <SelectItem value="title">Титул</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assetSortBy} onValueChange={(value: AssetSortBy) => onAssetSortByChange(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Сортировка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sortOrder">По порядку</SelectItem>
              <SelectItem value="nameRu">По названию</SelectItem>
              <SelectItem value="groupKey">По группе</SelectItem>
              <SelectItem value="createdAt">По дате</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assetSortDir} onValueChange={(value: SortDirection) => onAssetSortDirChange(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Направление" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">По возрастанию</SelectItem>
              <SelectItem value="desc">По убыванию</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 rounded-lg border px-3">
            <input
              id="include-inactive-assets"
              type="checkbox"
              checked={includeInactiveAssets}
              onChange={(event) => onIncludeInactiveAssetsChange(event.target.checked)}
            />
            <Label htmlFor="include-inactive-assets" className="cursor-pointer">Показывать выключенные</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onGroupAssetsByKeyChange(!groupAssetsByKey)}>
            {groupAssetsByKey ? "Выключить группировку" : "Группировать по группе"}
          </Button>
          <Button variant="outline" onClick={onBulkImportClick}>Массовый импорт</Button>
          <Button
            variant="destructive"
            disabled={selectedAssetIds.length === 0 || bulkDeletePending}
            onClick={onBulkDelete}
          >
            Удалить выбранные ({selectedAssetIds.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {galleryContent}
      </CardContent>
    </Card>
  );
}

function renderAchievementsContent(params: {
  isLoading: boolean;
  isError: boolean;
  achievements: AchievementItem[];
  blockByCode: Map<string, BuildingBlockItem>;
  onEdit: (item: AchievementItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}): React.ReactNode {
  if (params.isLoading) {
    return <TableSkeleton />;
  }

  if (params.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Не удалось загрузить достижения.
      </div>
    );
  }

  return (
    <AchievementsTable
      achievements={params.achievements}
      blockByCode={params.blockByCode}
      onEdit={params.onEdit}
      onDelete={params.onDelete}
      deletePending={params.deletePending}
    />
  );
}

function renderBlocksContent(params: {
  isLoading: boolean;
  isError: boolean;
  blocks: BuildingBlockItem[];
  onEdit: (item: BuildingBlockItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}): React.ReactNode {
  if (params.isLoading) {
    return <TableSkeleton />;
  }

  if (params.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Не удалось загрузить параметры условий.
      </div>
    );
  }

  return (
    <BlocksTable
      blocks={params.blocks}
      onEdit={params.onEdit}
      onDelete={params.onDelete}
      deletePending={params.deletePending}
    />
  );
}

export default function AdminGamificationPage() { // NOSONAR: orchestration component with UI state wiring
  const queryClient = useQueryClient();
  const [achievementStatusFilter, setAchievementStatusFilter] = useState<string>("all");
  const [includeInactiveBlocks, setIncludeInactiveBlocks] = useState(true);
  const [achievementDialogOpen, setAchievementDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<AchievementItem | null>(null);
  const [editingBlock, setEditingBlock] = useState<BuildingBlockItem | null>(null);
  const [editingRewardAsset, setEditingRewardAsset] = useState<RewardAssetItem | null>(null);
  const [achievementForm, setAchievementForm] = useState<AchievementFormState>(EMPTY_ACHIEVEMENT_FORM);
  const [blockForm, setBlockForm] = useState<BuildingBlockFormState>(EMPTY_BLOCK_FORM);
  const [blockFieldPopoverOpen, setBlockFieldPopoverOpen] = useState(false);
  const [rewardAssetForm, setRewardAssetForm] = useState<RewardAssetFormState>(EMPTY_REWARD_ASSET_FORM);
  const [rewardAssetDialogOpen, setRewardAssetDialogOpen] = useState(false);
  const [rewardAssetFile, setRewardAssetFile] = useState<File | null>(null);
  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [bulkImportAssetType, setBulkImportAssetType] = useState<IconType>("badge");
  const [bulkImportFiles, setBulkImportFiles] = useState<File[]>([]);
  const [bulkImportGroupKey, setBulkImportGroupKey] = useState("default");
  const [bulkImportTagsText, setBulkImportTagsText] = useState("");
  const [bulkImportSortStart, setBulkImportSortStart] = useState("0");
  const [includeInactiveAssets, setIncludeInactiveAssets] = useState(true);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [assetSortBy, setAssetSortBy] = useState<AssetSortBy>("sortOrder");
  const [assetSortDir, setAssetSortDir] = useState<SortDirection>("asc");
  const [groupAssetsByKey, setGroupAssetsByKey] = useState(true);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // Этап 4: Field-registry для динамического конструктора условий
  const [selectedFieldValues, setSelectedFieldValues] = useState<Record<string, ConditionPrimitiveValue[]>>({});
  const [isLoadingFieldValues, setIsLoadingFieldValues] = useState<Record<string, boolean>>({});

  const achievementsQuery = useQuery({
    queryKey: ["admin-gamification-achievements", achievementStatusFilter],
    queryFn: () => fetchAchievements(achievementStatusFilter),
  });

  const blocksQuery = useQuery({
    queryKey: ["admin-gamification-blocks", includeInactiveBlocks],
    queryFn: () => fetchBuildingBlocks(includeInactiveBlocks),
  });

  const fieldRegistryQuery = useQuery({
    queryKey: ["admin-gamification-field-registry"],
    queryFn: async () => {
      return await apiRequest<FieldRegistryResponse>("/api/admin/gamification/field-registry");
    },
    staleTime: 5 * 60 * 1000,
  });

  const rewardAssetsQuery = useQuery({
    queryKey: ["admin-gamification-reward-assets", includeInactiveAssets],
    queryFn: () => fetchRewardAssets(includeInactiveAssets),
  });

  const fieldRegistryGroups = fieldRegistryQuery.data?.registry ?? {};
  const fieldRegistryOptions = useMemo(
    () => Object.values(fieldRegistryGroups).flat(),
    [fieldRegistryGroups],
  );
  const selectedBlockField = useMemo(
    () => fieldRegistryOptions.find((field) => field.key === blockForm.sourceKey) ?? null,
    [fieldRegistryOptions, blockForm.sourceKey],
  );

  const blockByCode = useMemo(() => {
    return new Map((blocksQuery.data ?? []).map((item) => [item.code, item]));
  }, [blocksQuery.data]);

  const achievementRuleSummary = useMemo(
    () => summarizeConditions(achievementForm.conditions, achievementForm.conditionsLogic, blockByCode),
    [achievementForm.conditions, achievementForm.conditionsLogic, blockByCode],
  );

  const activeBlocks = useMemo(
    () => (blocksQuery.data ?? []).filter((item) => item.isActive),
    [blocksQuery.data],
  );

  const achievementSummary = useMemo(() => {
    const items = achievementsQuery.data ?? [];
    return {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      draft: items.filter((item) => item.status === "draft").length,
    };
  }, [achievementsQuery.data]);

  const rewardAssetsSummary = useMemo(() => {
    const items = rewardAssetsQuery.data ?? [];
    return {
      total: items.length,
      active: items.filter((item) => item.isActive).length,
    };
  }, [rewardAssetsQuery.data]);

  const filteredRewardAssets = useMemo(() => {
    const normalizedSearch = assetSearch.trim().toLowerCase();
    const source = rewardAssetsQuery.data ?? [];

    const filtered = source.filter((item) => {
      if (assetTypeFilter !== "all" && item.assetType !== assetTypeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [item.nameRu, item.groupKey, item.descriptionRu ?? "", ...(item.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    const sorted = [...filtered].sort((a, b) => {
      const direction = assetSortDir === "asc" ? 1 : -1;

      if (assetSortBy === "sortOrder") {
        return (a.sortOrder - b.sortOrder) * direction;
      }

      if (assetSortBy === "createdAt") {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }

      const left = (a[assetSortBy] ?? "").toString().toLowerCase();
      const right = (b[assetSortBy] ?? "").toString().toLowerCase();
      if (left === right) return 0;
      return left > right ? direction : -direction;
    });

    return sorted;
  }, [rewardAssetsQuery.data, assetSearch, assetTypeFilter, assetSortBy, assetSortDir]);

  const groupedRewardAssets = useMemo(() => {
    const map = new Map<string, RewardAssetItem[]>();
    filteredRewardAssets.forEach((item) => {
      const key = item.groupKey || "default";
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [filteredRewardAssets]);

  const rewardAssetsByType = useMemo(() => {
    const source = rewardAssetsQuery.data ?? [];
    return {
      badge: source.filter((item) => item.assetType === "badge" && item.isActive),
      star: source.filter((item) => item.assetType === "star" && item.isActive),
      title: source.filter((item) => item.assetType === "title" && item.isActive),
    };
  }, [rewardAssetsQuery.data]);

  const resetAchievementDialog = () => {
    setEditingAchievement(null);
    setAchievementForm(EMPTY_ACHIEVEMENT_FORM);
    setAchievementDialogOpen(false);
  };

  const resetBlockDialog = () => {
    setEditingBlock(null);
    setBlockForm(EMPTY_BLOCK_FORM);
    setBlockDialogOpen(false);
  };

  const invalidateAchievements = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-achievements"] });
  };

  const invalidateBlocks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-blocks"] });
  };

  const invalidateRewardAssets = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-reward-assets"] });
  };

  const saveAchievementMutation = useMutation({
    mutationFn: async () => {
      if (achievementForm.status === "active" && achievementForm.conditions.length === 0) {
        throw new Error("Нельзя сохранить активное достижение без условий");
      }

      if (achievementForm.iconType === "star" && !achievementForm.rewardValue.trim()) {
        throw new Error("Для награды типа «Звезда» нужно указать количество звезд");
      }

      if (achievementForm.iconType === "title" && !achievementForm.rewardValue.trim()) {
        throw new Error("Для награды типа «Титул» нужно указать текст титула");
      }

      const conditionsPayload = {
        logic: achievementForm.conditionsLogic,
        items: achievementForm.conditions.map((condition) => ({
          blockCode: condition.blockCode,
          operator: condition.operator,
          valueType: condition.valueType,
          value: parseConditionValue(condition.valueType, condition.value),
        })),
      };

      const payload = {
        code: achievementForm.code.trim(),
        titleRu: achievementForm.titleRu.trim(),
        descriptionRu: achievementForm.descriptionRu.trim() || null,
        iconType: achievementForm.iconType,
        badgeImageUrl: achievementForm.badgeImageUrl.trim() || null,
        rewardPayload: {
          kind: achievementForm.iconType,
          titleRu: achievementForm.rewardTitleRu.trim() || null,
          descriptionRu: achievementForm.rewardDescriptionRu.trim() || null,
          value: parseRewardValueInput(achievementForm.rewardValue),
          badgeImageUrl: achievementForm.badgeImageUrl.trim() || null,
        },
        conditionsPayload,
        status: achievementForm.status,
        sortOrder: Number(achievementForm.sortOrder || "0"),
      };

      if (editingAchievement) {
        return apiRequest(`/api/admin/gamification/achievements/${editingAchievement.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/achievements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingAchievement ? "Достижение обновлено" : "Достижение создано" });
      await invalidateAchievements();
      resetAchievementDialog();
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить достижение",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteAchievementMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/gamification/achievements/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      toast({ title: "Достижение удалено" });
      await invalidateAchievements();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить достижение",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const saveBlockMutation = useMutation({
    mutationFn: async () => {
      if (blockForm.supportedOperators.length === 0) {
        throw new Error("Нужно выбрать хотя бы один оператор");
      }

      const payload = {
        code: blockForm.code.trim(),
        labelRu: blockForm.labelRu.trim(),
        sourceKey: blockForm.sourceKey.trim() || null,
        valueType: blockForm.valueType,
        supportedOperators: blockForm.supportedOperators,
        isActive: blockForm.isActive,
      };

      if (editingBlock) {
        return apiRequest(`/api/admin/gamification/building-blocks/${editingBlock.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/building-blocks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingBlock ? "Параметр условия обновлен" : "Параметр условия создан" });
      await invalidateBlocks();
      resetBlockDialog();
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить параметр условия",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/gamification/building-blocks/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      toast({ title: "Параметр условия удален" });
      await invalidateBlocks();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить параметр условия",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const saveRewardAssetMutation = useMutation({
    mutationFn: async () => {
      const imageUrl = rewardAssetFile
        ? await convertFileToWebpDataUrl(rewardAssetFile)
        : rewardAssetForm.imageUrl.trim();

      if (!imageUrl) {
        throw new Error("Нужно выбрать локальное изображение");
      }

      const payload = {
        assetType: rewardAssetForm.assetType,
        nameRu: rewardAssetForm.nameRu.trim(),
        imageUrl,
        descriptionRu: rewardAssetForm.descriptionRu.trim() || null,
        groupKey: rewardAssetForm.groupKey.trim() || "default",
        tags: rewardAssetForm.tagsText.split(",").map((item) => item.trim()).filter(Boolean),
        sortOrder: Number(rewardAssetForm.sortOrder || "0"),
        isActive: rewardAssetForm.isActive,
      };

      if (editingRewardAsset) {
        return apiRequest(`/api/admin/gamification/reward-assets/${editingRewardAsset.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/reward-assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingRewardAsset ? "Ассет обновлен" : "Ассет добавлен" });
      await invalidateRewardAssets();
      setEditingRewardAsset(null);
      setRewardAssetFile(null);
      setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
      setRewardAssetDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить ассет",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteRewardAssetMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/admin/gamification/reward-assets/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Ассет удален" });
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить ассет",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteRewardAssetsMutation = useMutation({
    mutationFn: async (ids: string[]) => apiRequest<{ success: boolean; deletedCount: number }>("/api/admin/gamification/reward-assets/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
    onSuccess: async (result) => {
      toast({ title: "Массовое удаление выполнено", description: `Удалено: ${result.deletedCount}` });
      setSelectedAssetIds([]);
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить выбранные ассеты",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const bulkImportRewardAssetsMutation = useMutation({
    mutationFn: async () => {
      if (bulkImportFiles.length === 0) {
        throw new Error("Выберите хотя бы один файл");
      }

      const commonTags = bulkImportTagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
      const sortStart = Number(bulkImportSortStart || "0");

      const items = await Promise.all(
        bulkImportFiles.map(async (file, index) => ({
          assetType: bulkImportAssetType,
          nameRu: fileNameToAssetTitle(file.name),
          imageUrl: await convertFileToWebpDataUrl(file),
          groupKey: bulkImportGroupKey.trim() || "default",
          tags: commonTags,
          sortOrder: Number.isFinite(sortStart) ? sortStart + index : index,
        })),
      );

      return apiRequest<{ success: boolean; createdCount: number }>("/api/admin/gamification/reward-assets/bulk-import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: async (result) => {
      toast({ title: "Массовый импорт завершен", description: `Создано: ${result.createdCount}` });
      setBulkImportDialogOpen(false);
      setBulkImportFiles([]);
      setBulkImportGroupKey("default");
      setBulkImportTagsText("");
      setBulkImportSortStart("0");
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось импортировать ассеты",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  // Этап 7: Mutation для reconcile (ручной пересчёт)
  const reconcileMutation = useMutation({
    mutationFn: runReconcile,
    onSuccess: async (result) => {
      toast({
        title: "Пересчёт завершен",
        description: `Результаты: ${JSON.stringify(result.summary)}`,
      });
      // Инвалидируем query для обновления данных
      queryClient.invalidateQueries({ queryKey: ["admin-gamification-achievements"] });
    },
    onError: (error) => {
      toast({
        title: "Не удалось запустить пересчёт",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const addCondition = () => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createEmptyCondition()],
    }));
  };

  const applyFieldSelection = (fieldKey: string) => {
    const selectedField = fieldRegistryOptions.find((field) => field.key === fieldKey);
    if (!selectedField) {
      return;
    }

    setBlockForm((prev) => {
      const allowedOperators = new Set(OPERATOR_OPTIONS_BY_VALUE_TYPE[selectedField.type]);
      const preservedOperators = prev.supportedOperators.filter((operator) => allowedOperators.has(operator));

      return {
        ...prev,
        sourceKey: selectedField.key,
        code: sourceKeyToCode(selectedField.key),
        valueType: selectedField.type,
        supportedOperators: preservedOperators.length > 0 ? preservedOperators : [...OPERATOR_OPTIONS_BY_VALUE_TYPE[selectedField.type]],
      };
    });

    if (selectedField.type === "string") {
      loadFieldValues(selectedField.key);
    }
  };

  const loadFieldValues = async (fieldKey: string) => {
    if (selectedFieldValues[fieldKey]) {
      return; // Already cached
    }

    setIsLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const data = await apiRequest<{ success: boolean; field: string; values: ConditionPrimitiveValue[] }>(
        `/api/admin/gamification/field-values?field=${encodeURIComponent(fieldKey)}&limit=200`,
      );
      setSelectedFieldValues((prev) => ({
        ...prev,
        [fieldKey]: data.values ?? [],
      }));
    } catch {
      // Silent fail - field values are optional for UI
    } finally {
      setIsLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const updateCondition = (conditionId: string, updates: Partial<AchievementConditionFormState>) => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((condition) => {
        if (condition.id !== conditionId) {
          return condition;
        }

        const nextCondition = { ...condition, ...updates };

        if (updates.blockCode) {
          const block = blockByCode.get(updates.blockCode);
          if (block) {
            nextCondition.valueType = block.valueType;
            nextCondition.operator = block.supportedOperators[0] ?? nextCondition.operator;
            nextCondition.value = block.valueType === "boolean" ? "false" : "";

            // Этап 4: Загружаем DISTINCT values для string field'ов если есть sourceKey
            if (block.sourceKey && block.valueType === "string") {
              loadFieldValues(block.sourceKey);
            }
          }
        }

        return nextCondition;
      }),
    }));
  };

  const removeCondition = (conditionId: string) => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((condition) => condition.id !== conditionId),
    }));
  };

  const handleEditAchievement = (item: AchievementItem) => {
    setEditingAchievement(item);
    setAchievementForm(achievementToForm(item));
    setAchievementDialogOpen(true);
  };

  const handleEditBlock = (item: BuildingBlockItem) => {
    setEditingBlock(item);
    setBlockForm(blockToForm(item));
    setBlockDialogOpen(true);
  };

  const handleEditRewardAsset = (item: RewardAssetItem) => {
    setEditingRewardAsset(item);
    setRewardAssetFile(null);
    setRewardAssetForm({
      assetType: item.assetType,
      nameRu: item.nameRu,
      imageUrl: item.imageUrl,
      descriptionRu: item.descriptionRu ?? "",
      groupKey: item.groupKey,
      tagsText: (item.tags ?? []).join(", "),
      sortOrder: String(item.sortOrder ?? 0),
      isActive: item.isActive,
    });
    setRewardAssetDialogOpen(true);
  };

  const openCreateRewardAssetDialog = () => {
    setEditingRewardAsset(null);
    setRewardAssetFile(null);
    setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
    setRewardAssetDialogOpen(true);
  };

   const handleAssetSelect = (assetId: string, checked: boolean) => {
     setSelectedAssetIds((prev) => getUpdatedAssetIds(prev, assetId, checked));
   };

   const achievementsContent = renderAchievementsContent({
    isLoading: achievementsQuery.isLoading,
    isError: achievementsQuery.isError,
    achievements: achievementsQuery.data ?? [],
    blockByCode,
    onEdit: handleEditAchievement,
    onDelete: (id) => deleteAchievementMutation.mutate(id),
    deletePending: deleteAchievementMutation.isPending,
  });

  const blocksContent = renderBlocksContent({
    isLoading: blocksQuery.isLoading,
    isError: blocksQuery.isError,
    blocks: blocksQuery.data ?? [],
    onEdit: handleEditBlock,
    onDelete: (id) => deleteBlockMutation.mutate(id),
    deletePending: deleteBlockMutation.isPending,
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Геймификация</h1>
            <p className="mt-2 text-gray-600">
              Отдельный раздел для управления достижениями, наградами и параметрами условий.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={openCreateRewardAssetDialog}
              title="Новый ассет"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новый ассет</span>
              <span className="sm:hidden">Ассет</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => {
                setEditingBlock(null);
                setBlockForm(EMPTY_BLOCK_FORM);
                setBlockDialogOpen(true);
              }}
              title="Новый параметр условия"
            >
              <Blocks className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новый параметр</span>
              <span className="sm:hidden">Параметр</span>
            </Button>
            <Button
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => {
                setEditingAchievement(null);
                setAchievementForm(EMPTY_ACHIEVEMENT_FORM);
                setAchievementDialogOpen(true);
              }}
              title="Новое достижение"
            >
              <Trophy className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новое достижение</span>
              <span className="sm:hidden">Достижение</span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              title="Пересчитать достижения"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">
                {reconcileMutation.isPending ? "Пересчитываю..." : "Пересчитать достижения"}
              </span>
              <span className="sm:hidden">Пересчёт</span>
            </Button>
          </div>
        </div>

        <GamificationStats achievementSummary={achievementSummary} rewardAssetsSummary={rewardAssetsSummary} />

        <Tabs defaultValue="achievements" className="space-y-6">
          <TabsList>
            <TabsTrigger value="achievements">Достижения</TabsTrigger>
            <TabsTrigger value="blocks">Параметры условий</TabsTrigger>
            <TabsTrigger value="gallery">Галерея</TabsTrigger>
          </TabsList>

          <TabsContent value="achievements" className="space-y-6">
            <AchievementsTabContent
              achievementStatusFilter={achievementStatusFilter}
              onStatusFilterChange={setAchievementStatusFilter}
              achievementsContent={achievementsContent}
            />
          </TabsContent>

          <TabsContent value="blocks" className="space-y-6">
            <BlocksTabContent
              includeInactiveBlocks={includeInactiveBlocks}
              onIncludeInactiveChange={setIncludeInactiveBlocks}
              blocksContent={blocksContent}
            />
          </TabsContent>

          <TabsContent value="gallery" className="space-y-6">
            <GalleryTabContent
              assetSearch={assetSearch}
              onAssetSearchChange={setAssetSearch}
              assetTypeFilter={assetTypeFilter}
              onAssetTypeFilterChange={setAssetTypeFilter}
              assetSortBy={assetSortBy}
              onAssetSortByChange={setAssetSortBy}
              assetSortDir={assetSortDir}
              onAssetSortDirChange={setAssetSortDir}
              groupAssetsByKey={groupAssetsByKey}
              onGroupAssetsByKeyChange={setGroupAssetsByKey}
              includeInactiveAssets={includeInactiveAssets}
              onIncludeInactiveAssetsChange={setIncludeInactiveAssets}
              onBulkImportClick={() => setBulkImportDialogOpen(true)}
              selectedAssetIds={selectedAssetIds}
              onBulkDelete={() => bulkDeleteRewardAssetsMutation.mutate(selectedAssetIds)}
              bulkDeletePending={bulkDeleteRewardAssetsMutation.isPending}
              galleryContent={
                <>
                  {rewardAssetsQuery.isLoading ? <TableSkeleton /> : null}
                  {rewardAssetsQuery.isError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Не удалось загрузить ассеты галереи.</div>
                  ) : null}
                  {!rewardAssetsQuery.isLoading && !rewardAssetsQuery.isError ? (
                    <RewardAssetsGalleryContent
                      groupAssetsByKey={groupAssetsByKey}
                      groupedRewardAssets={groupedRewardAssets}
                      filteredRewardAssets={filteredRewardAssets}
                      selectedAssetIds={selectedAssetIds}
                      onAssetSelect={handleAssetSelect}
                      onEditAsset={handleEditRewardAsset}
                      onDeleteAsset={deleteRewardAssetMutation.mutate}
                      deletePending={deleteRewardAssetMutation.isPending}
                    />
                  ) : null}
                </>
              }
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={achievementDialogOpen} onOpenChange={(open) => (open ? setAchievementDialogOpen(true) : resetAchievementDialog())}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAchievement ? "Редактирование достижения" : "Новое достижение"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="achievement-title">Название</Label>
              <Input
                id="achievement-title"
                value={achievementForm.titleRu}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, titleRu: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="achievement-code">Код</Label>
              <Input
                id="achievement-code"
                value={achievementForm.code}
                disabled={Boolean(editingAchievement)}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="achievement-description">Описание</Label>
              <Textarea
                id="achievement-description"
                value={achievementForm.descriptionRu}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, descriptionRu: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Тип награды</Label>
              <Select
                value={achievementForm.iconType}
                onValueChange={(value: IconType) => setAchievementForm((prev) => ({
                  ...prev,
                  iconType: value,
                  rewardValue: getDefaultRewardValue(value, prev.rewardValue),
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="badge">Бейдж</SelectItem>
                  <SelectItem value="star">Звезда</SelectItem>
                  <SelectItem value="title">Титул</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Вид награды</Label>
              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="achievement-reward-asset-select">Выбрать</Label>
                  <Select
                    value={achievementForm.badgeImageUrl || "__none"}
                    onValueChange={(value) => setAchievementForm((prev) => ({
                      ...prev,
                      badgeImageUrl: value === "__none" ? "" : value,
                    }))}
                  >
                    <SelectTrigger id="achievement-reward-asset-select">
                      <SelectValue placeholder="Выберите ассет из галереи" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Без изображения</SelectItem>
                      {rewardAssetsByType[achievementForm.iconType].map((asset) => (
                        <SelectItem key={asset.id} value={asset.imageUrl}>
                          {asset.nameRu} ({asset.groupKey})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rewardAssetsByType[achievementForm.iconType].length === 0 ? (
                    <p className="text-sm text-gray-500">Для типа «{ICON_TYPE_LABELS[achievementForm.iconType]}» пока нет активных ассетов в галерее.</p>
                  ) : null}
                  {achievementForm.badgeImageUrl ? (
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="mb-2 text-sm font-medium text-gray-700">Предпросмотр</p>
                      <AchievementImagePreview
                        src={achievementForm.badgeImageUrl}
                        alt="Предпросмотр награды"
                        triggerClassName="h-24 w-24"
                        imageClassName="rounded-lg"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="achievement-reward-title">Название награды</Label>
              <Input
                id="achievement-reward-title"
                value={achievementForm.rewardTitleRu}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, rewardTitleRu: event.target.value }))}
                placeholder="Например, Годовасик"
              />
            </div>
            <div className="space-y-2">
              <Label>Параметры награды</Label>
              <div className="rounded-lg border p-3">
                {achievementForm.iconType === "badge" ? (
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Для бейджа отдельное числовое значение не требуется.</p>
                    <p>Пользователь получает выбранный визуальный бейдж и описание награды.</p>
                  </div>
                ) : null}

                {achievementForm.iconType === "star" ? (
                  <div className="space-y-2">
                    <Label htmlFor="achievement-reward-stars">Количество звезд</Label>
                    <Select
                      value={achievementForm.rewardValue || "1"}
                      onValueChange={(value) => setAchievementForm((prev) => ({ ...prev, rewardValue: value }))}
                    >
                      <SelectTrigger id="achievement-reward-stars">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAR_REWARD_OPTIONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {achievementForm.iconType === "title" ? (
                  <div className="space-y-2">
                    <Label htmlFor="achievement-reward-title-value">Текст титула</Label>
                    <Input
                      id="achievement-reward-title-value"
                      value={achievementForm.rewardValue}
                      onChange={(event) => setAchievementForm((prev) => ({ ...prev, rewardValue: event.target.value }))}
                      placeholder="Почетный читатель"
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="achievement-reward-description">Описание награды</Label>
              <Textarea
                id="achievement-reward-description"
                value={achievementForm.rewardDescriptionRu}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, rewardDescriptionRu: event.target.value }))}
                placeholder="Короткое пояснение, что получает пользователь"
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={achievementForm.status}
                onValueChange={(value: AchievementStatus) => setAchievementForm((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="active">Активно</SelectItem>
                  <SelectItem value="archived">В архиве</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="achievement-sort-order">Порядок сортировки</Label>
              <Input
                id="achievement-sort-order"
                type="number"
                value={achievementForm.sortOrder}
                onChange={(event) => setAchievementForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Конструктор условий</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить условие
                </Button>
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <div className="w-full md:w-48 space-y-2">
                  <Label>Логика</Label>
                  <Select
                    value={achievementForm.conditionsLogic}
                    onValueChange={(value: ConditionsLogic) => setAchievementForm((prev) => ({ ...prev, conditionsLogic: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {achievementForm.conditions.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                    Пока нет условий. Добавьте хотя бы одно правило для выдачи достижения.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {achievementForm.conditions.map((condition, index) => {
                      const block = blockByCode.get(condition.blockCode);
                      const operators = block?.supportedOperators ?? [condition.operator || ">="];

                      return (
                        <div key={condition.id} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-gray-700">Условие {index + 1}</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeCondition(condition.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_1fr]">
                            <div className="space-y-2">
                              <Label>Параметр</Label>
                              <Select
                                value={condition.blockCode}
                                onValueChange={(value) => updateCondition(condition.id, { blockCode: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Выберите параметр условия" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeBlocks.map((item) => (
                                    <SelectItem key={item.id} value={item.code}>
                                      {item.labelRu}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Оператор</Label>
                              <Select
                                value={condition.operator}
                                onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {operators.map((operator) => (
                                    <SelectItem key={operator} value={operator} title={OPERATOR_HELP[operator] ?? operator}>
                                      {operator}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Значение</Label>
                              {condition.valueType === "boolean" ? (
                                <Select
                                  value={condition.value || "false"}
                                  onValueChange={(value) => updateCondition(condition.id, { value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">Да</SelectItem>
                                    <SelectItem value="false">Нет</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (() => {
                                const block = blockByCode.get(condition.blockCode);
                                const fieldKey = block?.sourceKey;
                                const fieldValues = fieldKey ? selectedFieldValues[fieldKey] : undefined;
                                const isLoading = !!(fieldKey && isLoadingFieldValues[fieldKey]);

                                return (
                                  <>
                                    {fieldValues && fieldValues.length > 0 ? (
                                      <Select
                                        value={condition.value}
                                        onValueChange={(value) => updateCondition(condition.id, { value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Выберите значение" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {fieldValues.map((val) => (
                                            <SelectItem key={String(val)} value={String(val)}>
                                              {String(val)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <Input
                                        type={condition.valueType === "number" ? "number" : "text"}
                                        value={condition.value}
                                        onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                                        placeholder={getConditionValuePlaceholder(condition)}
                                        disabled={isLoading}
                                      />
                                    )}
                                    {condition.blockCode === "favorite_genre" ? (
                                      <p className="text-xs text-muted-foreground">
                                        Поддерживается список через запятую, шаблон `*` и префиксы: например `Детские*`.
                                      </p>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Предпросмотр правила</Label>
              <div className="rounded-lg border bg-slate-50 p-4 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{achievementForm.titleRu || "Без названия"}</p>
                  <p className="text-gray-500">{achievementForm.descriptionRu || "Описание не задано"}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Условия</p>
                  {achievementForm.conditions.length === 0 ? (
                    <p className="text-gray-500">Условия пока не заданы.</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {achievementForm.conditions.map((condition, index) => (
                        <p key={condition.id} className="text-gray-600">
                          {index > 0 ? `${achievementForm.conditionsLogic} ` : ""}
                          {formatConditionPreview(condition, blockByCode.get(condition.blockCode))}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-gray-700"><span className="font-medium">Кратко:</span> {achievementRuleSummary}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Награда</p>
                  <p className="text-gray-600">
                    Тип: {ICON_TYPE_LABELS[achievementForm.iconType]}
                    {achievementForm.rewardTitleRu ? `, название: ${achievementForm.rewardTitleRu}` : ""}
                    {achievementForm.rewardValue ? `, значение: ${describeRewardValue(achievementForm.iconType, achievementForm.rewardValue)}` : ""}
                  </p>
                  {achievementForm.rewardDescriptionRu ? (
                    <p className="text-gray-500 mt-1">{achievementForm.rewardDescriptionRu}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetAchievementDialog}>Отмена</Button>
            <Button onClick={() => saveAchievementMutation.mutate()} disabled={saveAchievementMutation.isPending}>
              {saveAchievementMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockDialogOpen} onOpenChange={(open) => (open ? setBlockDialogOpen(true) : resetBlockDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBlock ? "Редактирование параметра условия" : "Новый параметр условия"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="block-label">Название</Label>
              <Input
                id="block-label"
                value={blockForm.labelRu}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, labelRu: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Источник поля из БД</Label>
              <Popover open={blockFieldPopoverOpen} onOpenChange={setBlockFieldPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={blockFieldPopoverOpen}
                    className="w-full justify-between"
                    disabled={fieldRegistryQuery.isLoading}
                  >
                    <span className="truncate text-left">
                      {selectedBlockField ? `${selectedBlockField.group} · ${selectedBlockField.label}` : "Выберите поле из реестра"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" portalled={false}>
                  <Command>
                    <CommandInput placeholder="Поиск поля..." />
                    <CommandList>
                      <CommandEmpty>
                        {fieldRegistryQuery.isError ? "Не удалось загрузить реестр полей" : "Поля не найдены"}
                      </CommandEmpty>
                      {Object.entries(fieldRegistryGroups).map(([group, fields]) => (
                        <CommandGroup key={group} heading={group}>
                          {fields.map((field) => (
                            <CommandItem
                              key={field.key}
                              value={`${field.label} ${field.key}`}
                              onSelect={() => {
                                applyFieldSelection(field.key);
                                setBlockFieldPopoverOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{field.label}</span>
                                <span className="text-xs text-muted-foreground">{field.key}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Поле, код и тип значения подставляются автоматически из реестра БД.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-code">Код</Label>
              <Input
                id="block-code"
                value={blockForm.code}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, code: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Можно скорректировать вручную, если нужен пользовательский код.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-value-type">Тип значения</Label>
              <Select
                value={blockForm.valueType}
                onValueChange={(value: ValueType) => {
                  setBlockForm((prev) => {
                    const allowed = new Set(OPERATOR_OPTIONS_BY_VALUE_TYPE[value]);
                    const preserved = prev.supportedOperators.filter((operator) => allowed.has(operator));
                    return {
                      ...prev,
                      valueType: value,
                      supportedOperators: preserved.length > 0 ? preserved : [...OPERATOR_OPTIONS_BY_VALUE_TYPE[value]],
                    };
                  });
                }}
              >
                <SelectTrigger id="block-value-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Число</SelectItem>
                  <SelectItem value="string">Строка</SelectItem>
                  <SelectItem value="boolean">Да/нет</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">При выборе поля из БД тип подставляется автоматически.</p>
            </div>
            <div className="space-y-2">
              <Label>Операторы</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                {OPERATOR_OPTIONS_BY_VALUE_TYPE[blockForm.valueType].map((operator) => {
                  const checked = blockForm.supportedOperators.includes(operator);
                  return (
                    <label key={operator} className="flex items-center gap-2 text-sm" title={OPERATOR_HELP[operator] ?? operator}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setBlockForm((prev) => {
                            const current = new Set(prev.supportedOperators);
                            if (event.target.checked) {
                              current.add(operator);
                            } else {
                              current.delete(operator);
                            }

                            return {
                              ...prev,
                              supportedOperators: Array.from(current),
                            };
                          });
                        }}
                      />
                      <span className="font-mono">{operator}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                id="block-active"
                type="checkbox"
                checked={blockForm.isActive}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Label htmlFor="block-active" className="cursor-pointer">Параметр активен</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetBlockDialog}>Отмена</Button>
            <Button onClick={() => saveBlockMutation.mutate()} disabled={saveBlockMutation.isPending}>
              {saveBlockMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rewardAssetDialogOpen} onOpenChange={(open) => {
        if (open) {
          setRewardAssetDialogOpen(true);
          return;
        }
        setRewardAssetDialogOpen(false);
        setEditingRewardAsset(null);
        setRewardAssetFile(null);
        setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRewardAsset ? "Редактирование ассета" : "Новый ассет"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип ассета</Label>
              <Select
                value={rewardAssetForm.assetType}
                onValueChange={(value: IconType) => setRewardAssetForm((prev) => ({ ...prev, assetType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="badge">Бейдж</SelectItem>
                  <SelectItem value="star">Звезда</SelectItem>
                  <SelectItem value="title">Титул</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-name">Название</Label>
              <Input
                id="asset-name"
                value={rewardAssetForm.nameRu}
                onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, nameRu: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-file">Изображение (локальный файл)</Label>
              <Input
                id="asset-file"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setRewardAssetFile(file);
                }}
              />
              {editingRewardAsset && !rewardAssetFile ? (
                <p className="text-xs text-muted-foreground">Текущая картинка сохранится, если новый файл не выбран.</p>
              ) : null}
              {rewardAssetFile ? (
                <p className="text-xs text-muted-foreground">Выбран файл: {rewardAssetFile.name}</p>
              ) : null}
              {!rewardAssetFile && rewardAssetForm.imageUrl ? (
                <AchievementImagePreview
                  src={rewardAssetForm.imageUrl}
                  alt="Предпросмотр ассета"
                  triggerClassName="h-16 w-16 border"
                  imageClassName="rounded"
                />
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="asset-group">Группа</Label>
                <Input
                  id="asset-group"
                  value={rewardAssetForm.groupKey}
                  onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, groupKey: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-order">Порядок</Label>
                <Input
                  id="asset-order"
                  type="number"
                  value={rewardAssetForm.sortOrder}
                  onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-tags">Теги (через запятую)</Label>
              <Input
                id="asset-tags"
                value={rewardAssetForm.tagsText}
                onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, tagsText: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-description">Описание</Label>
              <Textarea
                id="asset-description"
                value={rewardAssetForm.descriptionRu}
                onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, descriptionRu: event.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                id="asset-active"
                type="checkbox"
                checked={rewardAssetForm.isActive}
                onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Label htmlFor="asset-active" className="cursor-pointer">Ассет активен</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRewardAssetDialogOpen(false);
              setEditingRewardAsset(null);
              setRewardAssetFile(null);
              setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
            }}>
              Отмена
            </Button>
            <Button onClick={() => saveRewardAssetMutation.mutate()} disabled={saveRewardAssetMutation.isPending}>
              {saveRewardAssetMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkImportDialogOpen}
        onOpenChange={(open) => {
          setBulkImportDialogOpen(open);
          if (!open) {
            setBulkImportFiles([]);
            setBulkImportGroupKey("default");
            setBulkImportTagsText("");
            setBulkImportSortStart("0");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Массовый импорт ассетов</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип импортируемых ассетов</Label>
              <Select value={bulkImportAssetType} onValueChange={(value: IconType) => setBulkImportAssetType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="badge">Бейдж</SelectItem>
                  <SelectItem value="star">Звезда</SelectItem>
                  <SelectItem value="title">Титул</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-import-files">Файлы изображений</Label>
              <Input
                id="bulk-import-files"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setBulkImportFiles(Array.from(event.target.files ?? []))}
              />
              <p className="text-xs text-muted-foreground">Выбрано файлов: {bulkImportFiles.length}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bulk-import-group">Группа</Label>
                <Input
                  id="bulk-import-group"
                  value={bulkImportGroupKey}
                  onChange={(event) => setBulkImportGroupKey(event.target.value)}
                  placeholder="default"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-import-sort-start">Начальный порядок</Label>
                <Input
                  id="bulk-import-sort-start"
                  type="number"
                  value={bulkImportSortStart}
                  onChange={(event) => setBulkImportSortStart(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-import-tags">Теги (через запятую, ко всем файлам)</Label>
              <Input
                id="bulk-import-tags"
                value={bulkImportTagsText}
                onChange={(event) => setBulkImportTagsText(event.target.value)}
                placeholder="rare, seasonal"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkImportDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => bulkImportRewardAssetsMutation.mutate()} disabled={bulkImportRewardAssetsMutation.isPending}>
              {bulkImportRewardAssetsMutation.isPending ? "Импортируем..." : "Импортировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
