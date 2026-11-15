import type { ComponentProps } from 'react';
import { FileTree } from './file-tree';

export function BookmarkList(props: Omit<ComponentProps<typeof FileTree>, 'label'>) {
  return <section aria-label="保存したブックマーク"><FileTree {...props} label="ブックマーク" /></section>;
}
