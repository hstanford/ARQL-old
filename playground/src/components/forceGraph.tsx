import React from 'react';
import { runForceGraph } from '../forceGraph';
import styles from '../forceGraph.module.css';

export default function ForceGraph({
  linksData,
  nodesData,
  nodeHoverTooltip,
  onClickNode
}: any) {
  const [reload, setReload] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    let destroyFn;

    if (containerRef.current) {
      const { destroy, restart } = runForceGraph(
        containerRef.current,
        linksData,
        nodesData,
        nodeHoverTooltip,
        onClickNode
      );
      destroyFn = destroy;
      setReload(!reload);
      restart();
    }

    return destroyFn;
  }, [linksData.length, nodesData.length]);

  return <div ref={containerRef} className={styles.container} />;
}
