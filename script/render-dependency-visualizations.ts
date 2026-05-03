import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type CruiseDependency = {
  resolved?: string;
  module?: string;
  couldNotResolve?: boolean;
  circular?: boolean;
};

type CruiseModule = {
  source: string;
  dependencies?: CruiseDependency[];
};

type CruiseReport = {
  modules: CruiseModule[];
};

type Edge = {
  source: string;
  target: string;
};

type Graph = {
  nodes: Map<string, number>;
  edges: Map<string, number>;
};

const inputPath = process.argv[2] ?? "/tmp/voxlibris-dependency-cruiser.json";
const outputDir = path.join("docs", "02-architecture", "dependency-graphs");
const reportPath = path.join("docs", "02-architecture", "repository-dependency-map.md");

const report = JSON.parse(readFileSync(inputPath, "utf8")) as CruiseReport;

const internalPathPattern = /^(client\/src|server|shared)(\/|$)/;
const toPosix = (value: string) => value.replaceAll(path.sep, "/");
const isInternalPath = (value: string | undefined): value is string => Boolean(value && internalPathPattern.test(toPosix(value)));

const modules = report.modules
  .map((module) => ({ ...module, source: toPosix(module.source) }))
  .filter((module) => isInternalPath(module.source));

const internalEdges: Edge[] = [];
const unresolved: Array<{ source: string; target: string }> = [];
let circularEdges = 0;

for (const module of modules) {
  for (const dependency of module.dependencies ?? []) {
    if (dependency.circular) {
      circularEdges += 1;
    }

    const target = toPosix(dependency.resolved ?? dependency.module ?? "");
    if (dependency.couldNotResolve) {
      unresolved.push({ source: module.source, target });
      continue;
    }

    if (isInternalPath(target) && module.source !== target) {
      internalEdges.push({ source: module.source, target });
    }
  }
}

function topLevelGroup(filePath: string): string {
  if (filePath.startsWith("client/src/")) {
    return "client";
  }

  if (filePath.startsWith("server/")) {
    return "server";
  }

  return "shared";
}

function featureGroup(filePath: string): string {
  if (filePath === "shared/schema.ts" || filePath.startsWith("shared/")) {
    return "shared/schema";
  }

  if (filePath.startsWith("client/src/components/")) {
    const [, , , section] = filePath.split("/");
    return section.includes(".") ? "client/components/root" : `client/components/${section}`;
  }

  if (filePath.startsWith("client/src/pages/")) {
    const [, , , section] = filePath.split("/");
    return section.includes(".") ? "client/pages/root" : `client/pages/${section}`;
  }

  if (filePath.startsWith("client/src/")) {
    const [, , section] = filePath.split("/");
    if (["api", "hooks", "lib", "styles", "types"].includes(section)) {
      return `client/${section}`;
    }

    return "client/app-shell";
  }

  if (filePath.startsWith("server/services/")) {
    return "server/services";
  }

  if (filePath.startsWith("server/repositories/")) {
    return "server/repositories";
  }

  if (filePath.startsWith("server/middleware/")) {
    return "server/middleware";
  }

  if (filePath.startsWith("server/lib/")) {
    return "server/lib";
  }

  if (filePath.startsWith("server/routes/")) {
    return "server/routes";
  }

  if (filePath.startsWith("server/websocket/") || /^server\/websocket/.test(filePath)) {
    return "server/websocket";
  }

  if (filePath.startsWith("server/analytics/")) {
    return "server/analytics";
  }

  if (filePath.startsWith("server/audio/")) {
    return "server/audio";
  }

  if (filePath.startsWith("server/config/")) {
    return "server/config";
  }

  if (/^server\/(?:.*-routes|routes)[.]ts$/.test(filePath)) {
    return "server/routes";
  }

  if (/^server\/(?:index|vite|static|env|db|jwt-middleware)[.]ts$/.test(filePath)) {
    return "server/runtime";
  }

  return "server/domain-core";
}

function buildGraph(groupFor: (filePath: string) => string): Graph {
  const graph: Graph = {
    nodes: new Map(),
    edges: new Map(),
  };

  for (const module of modules) {
    const group = groupFor(module.source);
    graph.nodes.set(group, (graph.nodes.get(group) ?? 0) + 1);
  }

  for (const edge of internalEdges) {
    const source = groupFor(edge.source);
    const target = groupFor(edge.target);
    if (source === target) {
      continue;
    }

    const key = `${source}\t${target}`;
    graph.edges.set(key, (graph.edges.get(key) ?? 0) + 1);
  }

  return graph;
}

function renderMermaid(graph: Graph, title: string): string {
  const labels = [...graph.nodes.keys()].sort();
  const ids = new Map(labels.map((label, index) => [label, `n${index}`]));
  const lines = [
    "flowchart LR",
    `%% ${title}`,
    "",
  ];

  for (const label of labels) {
    const count = graph.nodes.get(label) ?? 0;
    lines.push(`${ids.get(label)}["${label}<br/>${count} files"]`);
  }

  lines.push("");

  const edges = [...graph.edges.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [key, count] of edges) {
    const [source, target] = key.split("\t");
    lines.push(`${ids.get(source)} -->|${count}| ${ids.get(target)}`);
  }

  return `${lines.join("\n")}\n`;
}

function fanCounts(selector: "source" | "target"): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const edge of internalEdges) {
    const key = selector === "source" ? edge.source : edge.target;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);
}

function edgeCountBetween(sourceGroup: string, targetGroup: string): number {
  return internalEdges.filter(
    (edge) => topLevelGroup(edge.source) === sourceGroup && topLevelGroup(edge.target) === targetGroup,
  ).length;
}

function renderCountList(entries: Array<[string, number]>): string {
  return entries.map(([filePath, count]) => `- \`${filePath}\`: ${count}`).join("\n");
}

function renderMarkdown(topLevelMermaid: string, featureMermaid: string): string {
  const clientToServer = edgeCountBetween("client", "server");
  const serverToClient = edgeCountBetween("server", "client");
  const sharedToRuntime = edgeCountBetween("shared", "client") + edgeCountBetween("shared", "server");
  const generatedAt = new Date().toISOString().slice(0, 10);

  return `# Карта зависимостей репозитория

Сгенерировано: ${generatedAt}

## Вывод

Для Voxlibris визуализация связей стоит внедрения. В репозитории ${modules.length} внутренних модулей и ${internalEdges.length} внутренних импортов между \`client\`, \`server\` и \`shared\`; без графа трудно быстро увидеть реальные границы доменов и точки высокой связности.

Практичный уровень для проекта - не полный граф файлов, а свернутые Mermaid-графы по слоям и зонам. Полный граф получается слишком шумным, а эти два среза показывают главные архитектурные зависимости и остаются читаемыми в Markdown.

## Проверки

- Циклические зависимости: ${circularEdges}.
- Неразрешенные импорты в отчете dependency-cruiser: ${unresolved.length}.
- \`client -> server\`: ${clientToServer}.
- \`server -> client\`: ${serverToClient}.
- \`shared -> client/server\`: ${sharedToRuntime}.

## Верхний уровень

\`\`\`mermaid
${topLevelMermaid.trimEnd()}
\`\`\`

## Зоны

\`\`\`mermaid
${featureMermaid.trimEnd()}
\`\`\`

## Самые связные файлы

Исходящие внутренние импорты:

${renderCountList(fanCounts("source"))}

Входящие внутренние импорты:

${renderCountList(fanCounts("target"))}

## Как обновить

\`\`\`bash
pnpm run deps:graph
\`\`\`

Команда строит JSON через dependency-cruiser и затем обновляет:

- \`docs/02-architecture/dependency-graphs/top-level.mmd\`
- \`docs/02-architecture/dependency-graphs/feature-zones.mmd\`
- \`docs/02-architecture/repository-dependency-map.md\`

## Инструменты

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) выбран как основной инструмент: он поддерживает TypeScript, правила зависимостей и Mermaid/DOT-репортеры.
- [Madge](https://github.com/pahen/madge) оставлен как альтернативный быстрый инструмент для точечных проверок циклов.
- [Nx Graph](https://nx.dev/docs/features/explore-graph) не внедрялся: Voxlibris сейчас не оформлен как Nx workspace, поэтому это было бы слишком тяжелым изменением ради одной карты зависимостей.
- [Graphviz](https://graphviz.org/doc/info/command.html) полезен для SVG, но в текущем окружении \`dot\` не установлен; Mermaid дает переносимый результат без системной зависимости.
`;
}

mkdirSync(outputDir, { recursive: true });

const topLevelMermaid = renderMermaid(buildGraph(topLevelGroup), "Voxlibris top-level dependencies");
const featureMermaid = renderMermaid(buildGraph(featureGroup), "Voxlibris feature-zone dependencies");

writeFileSync(path.join(outputDir, "top-level.mmd"), topLevelMermaid);
writeFileSync(path.join(outputDir, "feature-zones.mmd"), featureMermaid);
writeFileSync(reportPath, renderMarkdown(topLevelMermaid, featureMermaid));

console.log(`Wrote ${reportPath}`);
console.log(`Wrote ${path.join(outputDir, "top-level.mmd")}`);
console.log(`Wrote ${path.join(outputDir, "feature-zones.mmd")}`);
