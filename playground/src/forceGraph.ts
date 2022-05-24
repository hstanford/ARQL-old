import * as d3 from 'd3';
import '@fortawesome/fontawesome-free/css/all.min.css';
import * as styles1 from './forceGraph.module.css';

import data, { getColourForSource } from './models';

const styles: any = styles1;

const CIRCLE_RADIUS = 40;
const SPREAD_FACTOR = 50;
const LINK_STRENGTH = 0.2;

export function runForceGraph(
  container: any,
  linksData: any[],
  nodesData: any[],
  nodeHoverTooltip: any,
  onClickNode: (node: any) => any
) {
  const links = linksData.map((d: any) => Object.assign({}, d));
  const nodes = nodesData.map((d: any) => Object.assign({}, d));

  const containerRect = container.getBoundingClientRect();
  const height = containerRect.height;
  const width = containerRect.width;

  const icon = (d: any) => {
    return d.name;
  };

  const drag = (simulation: any) => {
    const dragstarted = (event: any, d: any) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    };

    const dragged = (event: any, d: any) => {
      d.fx = event.x;
      d.fy = event.y;
    };

    const dragended = (event: any, d: any) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    };

    return d3
      .drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  };

  // Add the tooltip element to the graph
  const tooltip = document.querySelector('#graph-tooltip');
  if (!tooltip) {
    const tooltipDiv = document.createElement('div');
    tooltipDiv.classList.add(styles.tooltip);
    tooltipDiv.style.opacity = '0';
    tooltipDiv.id = 'graph-tooltip';
    document.body.appendChild(tooltipDiv);
  }
  const div = d3.select('#graph-tooltip');

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: any) => d.name)
        .strength(LINK_STRENGTH)
    )
    .force(
      'charge',
      d3.forceManyBody().strength(-(CIRCLE_RADIUS * SPREAD_FACTOR))
    )
    .force('x', d3.forceX())
    .force('y', d3.forceY());

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', [-width / 2, -height / 2, width, height])
    .call(
      d3.zoom().on('zoom', function (event) {
        svg.attr('transform', event.transform);
      })
    );

  const link = svg
    .append('g')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke-width', (d) => Math.sqrt(d.value));

  const node = svg
    .append('g')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', CIRCLE_RADIUS)
    .attr('fill', (d) =>
      getColourForSource(
        [...data.sources.entries()].find(
          ([key, source]) => source === d.model.source
        )[0]
      )
    )
    .call(drag(simulation));

  const label = svg
    .append('g')
    .attr('class', 'labels')
    .selectAll('text')
    .data(nodes)
    .enter()
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('class', (d) => 'fa')
    .text((d) => {
      return icon(d);
    })
    .call(drag(simulation));

  node.on('click', (event, d) => {
    onClickNode(d);
  });
  label.on('click', (event, d) => {
    onClickNode(d);
  });

  simulation.on('tick', () => {
    //update link positions
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    // update node positions
    node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

    // update label positions
    label
      .attr('x', (d) => {
        return d.x;
      })
      .attr('y', (d) => {
        return d.y;
      });
  });

  return {
    destroy: () => {
      simulation.stop();
    },
    nodes: () => {
      return svg.node();
    },
    restart: () => {
      return simulation.restart();
    },
  };
}
