import type { Plugin, PluginBuild } from "esbuild";
import ts from "typescript";
import fs from "fs";
import path from "path";

// Shared esbuild plugin that closes a hole in the import-resolution smoke
// checks (check-server-imports.ts / check-client-imports.ts /
// check-orphan-imports.ts).
//
// The problem:
//   esbuild's bundler ELIDES an import whose binding is never used as a value —
//   it can't tell a value import from a type-only import without type info, so
//   it drops `import { foo } from "./renamed-module"` when `foo` is unused. The
//   module specifier is then never resolved, and a missing/renamed local module
//   slips through the check even though the reference is genuinely broken.
//   Side-effect imports (`import "./x"`) and USED imports are already resolved
//   by the bundle; this plugin covers the remaining "unused binding" case.
//
// How it closes it:
//   For every local .ts/.tsx/.js/.jsx file esbuild loads, the plugin parses the
//   source with the TypeScript parser (parse only — NO type-checking) and pulls
//   out EVERY static import/export-from specifier plus string-literal dynamic
//   `import("...")` calls, regardless of whether the binding is used. It then
//   asks esbuild to resolve each LOCAL specifier (relative paths + the
//   configured aliases) via build.resolve, honouring the same aliases and
//   extensions as the surrounding build. Bare npm specifiers are left to
//   esbuild's normal external handling and skipped here. If any local specifier
//   fails to resolve, the file's load fails with a clear error naming it.
//
//   Using the TS parser (instead of a regex) means imports mentioned inside
//   comments or string literals never produce false positives.

interface LocalImportPluginOptions {
  // Alias keys configured on the surrounding esbuild build (e.g. "@",
  // "@shared", "@assets"). A specifier counts as LOCAL — and is therefore
  // resolved by this plugin — when it is a relative/absolute path or matches
  // one of these alias prefixes. Everything else is treated as a bare npm
  // package and left to esbuild's external handling.
  aliasKeys: string[];
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".cjs") || filePath.endsWith(".mjs"))
    return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

// Extract every static import/export-from module specifier and every
// string-literal dynamic import() specifier from a source file. Comments and
// string literals are ignored because we walk the real AST.
function extractSpecifiers(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKindFor(filePath),
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function isLocalSpecifier(spec: string, aliasKeys: string[]): boolean {
  if (spec.startsWith(".") || spec.startsWith("/")) return true;
  return aliasKeys.some((key) => spec === key || spec.startsWith(key + "/"));
}

export function localImportResolutionPlugin(
  options: LocalImportPluginOptions,
): Plugin {
  const { aliasKeys } = options;
  return {
    name: "local-import-resolution",
    setup(build: PluginBuild) {
      build.onLoad({ filter: /\.(tsx?|jsx?|cjs|mjs)$/ }, async (args) => {
        if (args.path.includes("node_modules")) return undefined;

        let source: string;
        try {
          source = await fs.promises.readFile(args.path, "utf8");
        } catch {
          // If we can't read it, let esbuild's default loader surface the error.
          return undefined;
        }

        const specifiers = extractSpecifiers(args.path, source);
        const resolveDir = path.dirname(args.path);
        const errors: { text: string }[] = [];
        const seen = new Set<string>();

        for (const spec of specifiers) {
          if (seen.has(spec)) continue;
          seen.add(spec);
          if (!isLocalSpecifier(spec, aliasKeys)) continue;

          const result = await build.resolve(spec, {
            resolveDir,
            kind: "import-statement",
          });
          if (result.errors.length > 0) {
            errors.push({
              text: `Could not resolve "${spec}" (imported with an unused binding, so esbuild would otherwise elide it)`,
            });
          }
        }

        if (errors.length > 0) return { errors };
        // Return undefined so esbuild loads and walks the file normally; we only
        // augment resolution, we don't replace the default loader.
        return undefined;
      });
    },
  };
}
