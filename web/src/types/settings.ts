export interface PreviewItem {
    name: string;
    type: 'service' | 'vm';
}

export interface DirectoryPreview {
    exists: boolean;
    isGitRepo: boolean;
    hasUncommittedChanges: boolean;
    items: PreviewItem[];
    actions: string[];
}
