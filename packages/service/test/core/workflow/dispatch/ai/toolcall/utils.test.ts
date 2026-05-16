import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { mergeDatasetToolFileUrls } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/utils';

describe('mergeDatasetToolFileUrls', () => {
  it('should append all file urls to legacy dataset search tool input', () => {
    const result = mergeDatasetToolFileUrls({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams: {
        [NodeInputKeyEnum.userChatInput]: 'find similar product'
      },
      fileUrls: ['/api/file/current.png', '/api/file/manual.pdf']
    });

    expect(result[NodeInputKeyEnum.userChatInput]).toEqual([
      'find similar product',
      '/api/file/current.png',
      '/api/file/manual.pdf'
    ]);
  });

  it('should prefer new dataset search input when it exists', () => {
    const result = mergeDatasetToolFileUrls({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams: {
        [NodeInputKeyEnum.userChatInput]: 'legacy query',
        [NodeInputKeyEnum.datasetSearchInput]: ['new query']
      },
      fileUrls: ['/api/file/current.png']
    });

    expect(result[NodeInputKeyEnum.userChatInput]).toBe('legacy query');
    expect(result[NodeInputKeyEnum.datasetSearchInput]).toEqual([
      'new query',
      '/api/file/current.png'
    ]);
  });

  it('should not change non-dataset tool input', () => {
    const startParams = {
      [NodeInputKeyEnum.userChatInput]: 'find similar product'
    };
    const result = mergeDatasetToolFileUrls({
      flowNodeType: FlowNodeTypeEnum.chatNode,
      startParams,
      fileUrls: ['/api/file/current.png', '/api/file/manual.pdf']
    });

    expect(result).toBe(startParams);
  });
});
