import React, { useMemo } from 'react';
import { Button, IconButton, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import CopilotModal from './CopilotModal';

const CopilotButton = () => {
  const { isPc } = useSystem();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const ButtonRender = useMemo(() => {
    if (isPc) {
      return (
        <Button
          leftIcon={<MyIcon name={'core/workflow/template'} w={['14px', '16px']} />}
          h={'34px'}
          variant={'whitePrimary'}
          onClick={onOpen}
        >
          Copilot
        </Button>
      );
    }
    return (
      <IconButton
        icon={<MyIcon name={'core/workflow/template'} w={'18px'} />}
        aria-label={''}
        size={'sm'}
        w={'34px'}
        h={'34px'}
        variant={'whitePrimary'}
        onClick={onOpen}
      />
    );
  }, [isPc, onOpen]);

  return (
    <>
      {ButtonRender}
      {isOpen && <CopilotModal isOpen={isOpen} onClose={onClose} />}
    </>
  );
};

export default React.memo(CopilotButton);
