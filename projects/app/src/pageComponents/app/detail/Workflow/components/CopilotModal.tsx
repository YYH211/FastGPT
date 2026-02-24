import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  Textarea,
  VStack
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { WorkflowUtilsContext } from '../../WorkflowComponents/context/workflowUtilsContext';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowPatchType } from '@fastgpt/global/core/workflow/patch';

const CopilotModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const { flowData2StoreData, initData } = useContextSelector(WorkflowUtilsContext, (v) => v);

  const applyResultToCanvas = useCallback(
    (result: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }) => {
      initData(
        {
          nodes: result.nodes,
          edges: result.edges
        },
        true
      );
    },
    [initData]
  );

  const { runAsync, loading } = useRequest(
    async ({ model }: { model: string }) => {
      const store = flowData2StoreData();
      if (!store) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setStreamText('');

      const res = await fetch('/api/core/workflow/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          model,
          nodes: store.nodes,
          edges: store.edges
        }),
        signal: abortRef.current.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`Copilot request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const parseSseLine = (line: string) => {
        // minimal SSE parsing: event: xxx \n data: yyy
        if (!line.startsWith('data:')) return null;
        return line.replace(/^data:\s?/, '');
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const raw of parts) {
          const dataStr = parseSseLine(raw.trim());
          if (!dataStr) continue;
          if (dataStr === '[DONE]') continue;

          try {
            const payload = JSON.parse(dataStr);
            const delta = payload?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              setStreamText((t) => t + delta);
            }
          } catch (e) {
            // ignore non-json lines
          }

          // patch result is sent via tool event but still in SSE; we simply look for our marker
          try {
            const toolPayload = JSON.parse(dataStr);
            if (toolPayload?.type === 'workflow_patch_result' && toolPayload?.result) {
              applyResultToCanvas(toolPayload.result);
              toast({
                status: 'success',
                title: '已生成并应用工作流'
              });
            }
            if (toolPayload?.type === 'workflow_patch_error') {
              toast({
                status: 'warning',
                title: '生成结果无法解析为可用补丁',
                description: toolPayload?.message
              });
            }
          } catch (e) {
            // ignore
          }
        }
      }
    },
    {
      manual: true
    }
  );

  const Footer = useMemo(() => {
    return (
      <HStack justifyContent={'space-between'} w={'100%'}>
        <Button
          variant={'whiteBase'}
          onClick={() => {
            abortRef.current?.abort();
            onClose();
          }}
        >
          关闭
        </Button>
        <HStack>
          <Button
            variant={'whitePrimary'}
            isLoading={loading}
            isDisabled={!prompt.trim()}
            onClick={() => runAsync({ model: 'gpt-4o-mini' })}
          >
            生成并应用
          </Button>
        </HStack>
      </HStack>
    );
  }, [loading, onClose, prompt, runAsync]);

  return (
    <MyModal isOpen={isOpen} onClose={onClose} title={'Workflow Copilot'} w={['95vw', '720px']}>
      <ModalBody>
        <VStack alignItems={'stretch'} spacing={3}>
          <Box fontSize={'sm'} color={'myGray.600'}>
            用自然语言描述你想要的工作流（会直接应用到当前画布）。
          </Box>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={'例如：从用户输入获取订单号，调用 HTTP 查询订单详情，如果未支付就触发支付链接，否则输出订单状态。'}
            rows={4}
          />
          <Flex
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'md'}
            p={3}
            minH={'140px'}
            whiteSpace={'pre-wrap'}
            fontSize={'sm'}
          >
            {streamText || '生成内容会在这里流式展示…'}
          </Flex>
        </VStack>
      </ModalBody>
      <ModalFooter>{Footer}</ModalFooter>
    </MyModal>
  );
};

export default React.memo(CopilotModal);
