// Topographic Phylomap
// code by Jamie Waese


//-------------------------------------------------------------------
// GLOBALS
var forceLayoutCurrentlyRunning = false;
var mouseOverTopoNode;
var currentlySelectedTopoNode = 0;
var currentlySelected2TopoNode = 0;
var frameRate = 40;
var numNodes;
var maxBranchLength = 0; // set low at first, then raise later according to the data
var maxAncestors = 0; // set low at first, then raise later according to the data
var dampening = 3;
var svgTopoMap, svgTopoMapContainer, tip, tipText;
var tooltip;
var pauseScreenRefresh=false;
var colours;//  = d3.scale.category20c();

function buildTopographicMap(data) {

	var defs;
	var filter = [];
	var svgShapes = [];
	var linearScale;
	var minimumTopoLineGap = 15;
	var maximumTopoLineGap = 30;

	// store the total number of nodes
	numNodes = nodesArray.length;

	// store some maximum values
	for (var i = 0; i < numNodes; i++) {
		// maximum depth (number of ancestors) 
		if (nodesArray[i].depth > maxAncestors) {
			maxAncestors = nodesArray[i].depth;
		}
		// maximum branch length
		if (nodesArray[i].length > maxBranchLength) {
			maxBranchLength = nodesArray[i].length;
		}
	}

	// make sure the root has a length
	nodes.length = 0;

	// establish our "linear scale" based on the maximum branch length
	linearScale = d3.scale.linear().domain([0, maxBranchLength]).range([minimumTopoLineGap, maximumTopoLineGap]);

	// add some additional variables to each node
	addVariablesToNodes(nodes);
	function addVariablesToNodes(data) {
		if (data.children) {
			for (var i=0; i < data.children.length; i++) {
				data.children[i].ancestorLengths = [];
				data.children[i].ancestorIDs = [];
				data.children[i].plateSizes = [];
				data.children[i].homePosition = { "x": undefined, "y": undefined };
				data.children[i].position = { "x": undefined, "y": undefined };
				data.children[i].targetPosition = { "x": undefined, "y": undefined};
				data.children[i].velocity = { "x": 0, "y": 0};
				data.children[i].type = "";
				data.children[i].previousPosition = { "x": 0, "y": 0};
				addVariablesToNodes(data.children[i]);
			}
		}
	}


	// Set root position in the center of the chart
	nodesArray[0].position = {"x":chartWidth/2, "y": chartHeight/2};


	// set the root node parent to itself
	nodesArray[0].parent = nodesArray[0];

	// set the initial node positions according to radial phylogenetic tree layout
	setInitialNodePositions(radiusMultiplier);


	// store ancestor ID's for each node
	for (var i = 1; i < nodesArray.length; i++) {
		var parent = nodesArray[i];
		while (parent.id != 0) {
			nodesArray[i].ancestorIDs.push(parent.id);
			parent = parent.parent;
		}
		nodesArray[i].ancestorIDs.push(0);
		nodesArray[i].ancestorIDs.reverse();
	}


	// store ancestor lengths for each node
	assignAncestorLengths(nodes);	
	function assignAncestorLengths(data) {
		if (data.children) {
			for (var i=0; i < data.children.length; i++) {
				data.children[i].ancestorLengths.push(data.children[i].length);
				
				var parentNode = data.children[i].parent;
				for (var k=0; k < maxAncestors; k++) {
					if (parentNode) {
						data.children[i].ancestorLengths.push(parentNode.length);
						parentNode = parentNode.parent;
					}
					else {
						data.children[i].ancestorLengths.push(0);
						parentNode = parent.parent;
					}
				}
				assignAncestorLengths(data.children[i]);
			}
		}
	}


	// store the type of each node
	assignType(nodes);
	nodesArray[0].type = "node";
	function assignType(data) {
		if (data.children) {
			for (var i=0; i < data.children.length; i++) {
				if (data.children[i].children) {
					data.children[i].type = "node";
				}
				else {
					data.children[i].type = "leaf"
				}
				assignType(data.children[i])
			}
		}
	}

	// set plate sizes for each node
	setPlateSizes(nodes);
	function setPlateSizes(data) {
		// recursively go through all the nodes and add a plateSizes array
		// with the scaled plate sizes from the bottom to the top
		// each node has a bottom layer (root) base that is 30 pixels wider than it's largest base
		if (data.children) {
			for (var i = 0; i < data.children.length; i++) {
				// assign scaled ancestor lengths
				var sum = 0;
				for (var k=0; k<maxAncestors; k++) {
					sum += linearScale(  Math.sqrt( data.children[i].ancestorLengths[k] / Math.PI )  );
					if (data.children[i].ancestorLengths[k] > 0 ) {
						data.children[i].plateSizes.push(sum);		
					}
					else {
						// insert a '0' element at front of array
						data.children[i].plateSizes.unshift(0);								
					}
				}
				data.children[i].plateSizes.push(sum);		

				// now reverse the order of the array
				data.children[i].plateSizes.reverse();
				
				setPlateSizes(data.children[i]);
			}
		}
	}

	// Now build the SVG
	svgTopoMap = d3.select("#topographicMap")
			.append("svg")
			.attr("width","100%")
			.attr("height","100%")
			.attr("id","svgTopoMap")
		.append("g")
			.attr("transform", "translate(0,0)")
		    .call(zoom);


	svgTopoMapContainer = svgTopoMap.append("g");
	var rect = svgTopoMapContainer.append("rect")
		.attr("x", -chartWidth*10)
		.attr("y", -chartHeight*10)
	    .attr("width", chartWidth*20)
	    .attr("height", chartHeight*20)
	    .style("fill", "none")
	    .style("pointer-events", "all");

	//SVG filter for the gooey effect
	//inspired by http://tympanus.net/codrops/2015/03/10/creative-gooey-effects/
	defs = svgTopoMapContainer.append('defs');

	// add multiple filters
	for (var i = 0; i <= maxAncestors; i++) {

		filter[i] = defs.append('filter')
			.attr('id','gooey-'+i)
			.attr("width", "300%")	//increase the width of the filter region to remove blur "boundary"
			.attr("x", "-100%") //make sure the center of the "width" lies in the middle
			.attr("height", "200%")
			.attr("y", "-50%")
			.attr("color-interpolation-filters","sRGB"); //to fix safari: http://stackoverflow.com/questions/24295043/svg-gaussian-blur-in-safari-unexpectedly-lightens-image

		filter[i].append('feGaussianBlur')
			.attr('in','SourceGraphic')
			.attr('stdDeviation','6') // increase this number for stronger goo effect. 
			.attr('result','blur');

		filter[i].append('feColorMatrix')
			.attr('in','blur')
			.attr('mode','matrix')
			.attr('values','1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7')
			.attr('result','gooey-'+i);

		filter[i].append('feComposite')
			.attr('in','SourceGraphic')
			.attr('in2','gooey-'+i)
			.attr('operator','atop');	
	}


	defs.append("marker")
			.attr({
				"id":"arrow",
				"viewBox":"0 -5 10 10",
				"refX":5,
				"refY":0,
				"markerWidth":4,
				"markerHeight":4,
				"orient":"auto"
			})
			.append("path")
				.attr("d", "M0,-5L10,0L0,5")
				.attr("class","arrowHead");

	// add multiple svgShapes 'g' tags
	for (var i = 0; i <= maxAncestors; i++) {
		svgShapes[i] = svgTopoMapContainer.append('g')
			.attr("id","svgShapes-"+i)
			.attr("sortKey", i)
			.style("filter", "url(#gooey-"+i+")");
	}
	
	// manually add the final svgShapes 'g' tags for the labelBG and label
	svgShapes[9998] = svgTopoMapContainer.append('g')
		.attr("id","svgLabelsBackgrounds")
		.attr("sortKey", "9998");

	svgShapes[9999] = svgTopoMapContainer.append('g')
		.attr("id","svgLabels")
		.attr("font-family", "sans-serif")
		.attr("sortKey", "9999");

	// draw lines connecting leafs to parent nodes
	svgShapes[9997] = svgTopoMapContainer.append('g')
		.attr("id","linksBetweenNodes")
		.attr("sortKey","9997");

	// draw root in center
	svgShapes[0] = svgTopoMapContainer.append("circle")
		.attr("class","linkLine")
		.attr("sortKey", "0")
		.attr("r", 8)
		.attr("cx", (chartWidth/2))
		.attr("cy", (chartHeight/2))
		.attr("fill", "lightgrey")
		.attr("stroke-width", 2)
        .attr("stroke", "lightgrey")
       	.style("pointer-events", "all");
		
	// Tooltips from: http://bl.ocks.org/Caged/6476579  /and/  https://github.com/caged/d3-tip
	// setup the tooltips (a global initialized above so it can be triggered by the Phylo Tree)
	tip = svgTopoMapContainer.append("g")
	 	.style("pointer-events", "none");

	tip.append("rect")
	 	.attr('class', 'd3-tip')
	 	.attr('id', 'd3-tipBox')
	 	.attr("width",150)
	 	.attr("height",40)
	 	.attr("x",-75)
	 	.attr("y",0)
	 	.attr("fill","darkred")
	 	.attr("opacity",0.7);

	tip.append('line')
	 	.attr('class', 'd3-tip')
		.attr("x1",0)
		.attr("x2",0)
		.attr("y1",40)
		.attr("y2",80)
		.style("stroke","darkred")
		.style("stroke-width",2);
	 
	tipText = tip.append("text")
	 	.attr('class', 'd3-tip')
		.attr("id", "d3-tipText")
		.attr("x", 0)
		.attr("y", 25)
		.attr("font-family", "sans-serif")
		.attr("text-anchor", "middle")
		.attr("fill", "white")
		.attr("font-size","14px")
		.text("Tool tip")
	    .style("pointer-events", "none");

	// When user selects a node with the dropdown menu, draw this selection marker over it
	var selectionMarker =  svgTopoMapContainer.append("g")
	 	.style("pointer-events", "none");

	selectionMarker.append("rect")
	 	.attr('class', 'selectionMarker')
	 	.attr('id', 'selectionMarkerBox')
	 	.attr("width",150)
	 	.attr("height",40)
	 	.attr("x",-75)
	 	.attr("y",0)
	 	.attr("fill","red")
	 	.attr("stroke-width",1)
	 	.attr("opacity",0.7);

	selectionMarker.append('line')
	 	.attr('class', 'selectionMarker')
	 	.attr('id', 'selectionMarkerLine')
		.attr("x1",0)
		.attr("x2",0)
		.attr("y1",40)
		.attr("y2",80)
		.style("stroke","red")
		.style("stroke-width",2);
	 
	var selectionMarkerText = selectionMarker.append("text")
	 	.attr('class', 'selectionMarker')
		.attr("id", "selectionMarkerText")
		.attr("x", 0)
		.attr("y", 25)
		.attr("font-family", "sans-serif")
		.attr("text-anchor", "middle")
		.attr("fill", "white")
		.attr("font-size","14px")
		.text("Tool tip")
	    .style("pointer-events", "none");

	var selectionMarker2 =  svgTopoMapContainer.append("g")
	 	.style("pointer-events", "none");

	selectionMarker2.append("rect")
	 	.attr('class', 'selectionMarker2')
	 	.attr('id', 'selectionMarker2Box')
	 	.attr("width",150)
	 	.attr("height",40)
	 	.attr("x",-75)
	 	.attr("y",0)
	 	.attr("fill","#99CC00")
	 	.attr("stroke-width",1)
	 	.attr("opacity",0.7);

	selectionMarker2.append('line')
	 	.attr('class', 'selectionMarker2')
	 	.attr('id', 'selectionMarker2Line')
		.attr("x1",0)
		.attr("x2",0)
		.attr("y1",40)
		.attr("y2",80)
		.style("stroke","black")
		.style("stroke-width",2);
	 
	var selectionMarker2Text = selectionMarker2.append("text")
	 	.attr('class', 'selectionMarker2')
		.attr("id", "selectionMarker2Text")
		.attr("x", 0)
		.attr("y", 25)
		.attr("font-family", "sans-serif")
		.attr("text-anchor", "middle")
		.attr("fill", "white")
		.attr("font-size","14px")
		.text("Tool tip")
	    .style("pointer-events", "none");

	// set the colour gradient according to the maximum depth
	if (maxAncestors <= 2) {
		colours = d3.scale.linear()
	    .domain([0, (maxAncestors+1)/2, maxAncestors + 2])
	    .range(["#004529", "#78c679", "#ffffe5"]);		
	}
	else {
		colours = d3.scale.linear()
	    .domain([1, (maxAncestors+1)/2, maxAncestors + 1])
	    .range(["#004529", "#78c679", "#ffffe5"]);
	}

	// draw all the nodes to the screen
	drawAllNodes(nodes);
	function drawAllNodes(data) {
		if (data.children) {
			for (var i=0; i < data.children.length; i++) {
				drawNode(data.children[i]);
				drawAllNodes(data.children[i]);
			}
		}
	}

	function drawNode(data) {
		// draw plates on top of each other
		for (var i = 0; i<data.plateSizes.length; i++) {
			function cloneI(i){return String(i)};

			// only draw base plates if the node is a terminal "leaf"
			if (data.children == undefined) {
				svgShapes[i].append("circle")
					.attr("id", "topoNode_"+data.id+"_"+i)
					.attr("class","topoLink")
					.attr("plate", i)
					.attr("node",data.id)
					.attr("link", data.ancestorIDs[i-1])
					.attr("r", data.plateSizes[i])
					.attr("cx", data.position.x)
					.attr("cy", data.position.y)
					.attr("fill", colours(i))
					.attr("initialColor", colours(i))
					.on("mouseover", function () { mouseOverTopoNode = data.id; mouseOverNode(data.id); mouseOverTopoLink(this) })
				    .on("mouseout", function() { mouseOverTopoNode = undefined; mouseOutNode(data.id); mouseOutTopoLink(this) })					    
				    .on("click", function() { 
						if (d3.event.shiftKey) {
				    		reactToSelection2Click(data.id);				    
						}
						else {
							reactToSelectionClick(data.id);				    
						}
					})

					.style("cursor", "pointer")
					.call(drag);
			}
			// now draw the link lines)
			if (i == data.plateSizes.length -1) {
				svgShapes[9997].append("line")
					.attr("id","link"+data.id)
					.attr("class","linkLine")
					.attr("sortKey","9997")
					.attr("x1", data.position.x)
                    .attr("y1", data.position.y)
                    .attr("x2", function() { if (data.parent.position) { return data.parent.position.x;} else {return data.position.x; } } )
                    .attr("y2", function() { if (data.parent.position) { return data.parent.position.y;} else {return data.position.y; } } )
                    .attr("stroke-width", 1)
                    .attr("stroke", "grey");                  

			// now draw the background label (black dot)
				svgShapes[9998].append("circle")
					.attr("id", "topoLabelBG_"+data.id)
					.attr("sortKey", "9998")
					.attr("class", function() { if (data.type == "node") {return "linkLine"} else {return "plate"} })
					.attr("r", function() { if (data.type == "node") {return 2.5} else {return 5}} )
					.attr("cx", data.position.x)
					.attr("cy", data.position.y)
					.attr("fill", function() { if (data.type == "leaf") {return "#444444"} else {return "lightgrey"}} )
					.attr("stroke", function() { if (data.type == "leaf") {return "#444444"} else {return "lightgrey"}} )
					.attr("stroke-width","2")
					.attr("initialColor", function() { if (data.type == "leaf") {return "black"} else {return "#444444"} })			    
			        .on("mouseover", function() { mouseOverTopoNode = data.id; mouseOverNode(data.id); })
			        .on("mouseout", function() { mouseOutNode(data.id) })	
					.on("click", function() { 
						if (d3.event.shiftKey) {
				    		reactToSelection2Click(data.id);				    
						}
						else {
							reactToSelectionClick(data.id);				    
						}
					})
					.style("cursor", "pointer")
					.call(drag);

				svgShapes[9999].append("text")
					.attr("id", "topoLabel_"+data.id)
					.attr("sortKey", "9999")
					.attr("dx", data.position.x)
					.attr("dy", data.position.y)
					.attr("text-anchor", "middle")
					.attr("fill", "black")
					.attr("font-size","10px")
					.text(data.name)
				    .style("pointer-events", "none")
					.call(drag);		     
			}	
		}	
	}

	// sort them so the lower plates are beneath the upper plates
	sortDOMlayers();
	function sortDOMlayers() {
		var svgChildren = $("svgTopoMap").children('*');
		svgChildren.sort(function(a,b){
			var an = a.getAttribute('sortKey');
			var bn = b.getAttribute('sortKey');

			if (an > bn) {
				return 1;
			}
			if (an < bn) {
				return -1;
			}
			return 0;
		});
		svgChildren.detach().appendTo($("svgTopoMap"));
	}

	// begin force layout
	forceLayout(nodes);
}
/// ------------------------------------------------------------
// set the initial node positions according to radial phylogenetic tree layout
function setInitialNodePositions(radiusMultiplier) {
	for (var i = 1; i < nodesArray.length; i++) {

        var r = nodesArray[i].y * radiusMultiplier;
        var a = (nodesArray[i].x - 90) / 180 * Math.PI;
        var _x = r * Math.cos(a);
        var _y = r * Math.sin(a);

        nodesArray[i].homePosition = { "x": _x, "y": _y };
        nodesArray[i].position = { "x": _x , "y": _y };
		nodesArray[i].targetPosition = { "x": _x , "y": _y};
	}
}

/// ------------------------------------------------------------
/// Force layout functions 
var tick;
var forceLayoutCurrentlyRunning = false;
var counter = 0;
function forceLayout(data) {
	//console.log("Beginning force layout");
	tick = setInterval(function() {
		forceLayoutCurrentlyRunning = true;
		attractNodes();
		repelNodes();
		//adjustPositionsOfCrossedItems();
		moveNodesToTarget();
		if (pauseScreenRefresh==false) {
			moveNodesAroundScreen();
			moveTooltipsToFollowNodes();
			shouldWeStopForceLayout();	
		}
		counter++;					
	},(1000/frameRate));
}


/// Stop force layout if nodes have stopped moving
function shouldWeStopForceLayout() {
	var stopLayout = true;
	var nodesStillMoving = 0;
	for (var i = 1; i < nodesArray.length; i++) {
		if (Math.abs(nodesArray[i].position.x - nodesArray[i].previousPosition.x) + Math.abs(nodesArray[i].position.y - nodesArray[i].previousPosition.y) > 0.005 ) {
			stopLayout = false;
			nodesStillMoving++;
		}
		nodesArray[i].previousPosition.x = nodesArray[i].position.x;
		nodesArray[i].previousPosition.y = nodesArray[i].position.y;
	}

	if (stopLayout) {
		pauseForceLayout();
		hideLinks();
	}

	var progress = 100 - (nodesStillMoving / nodesArray.length) * 100;
	$("#progressBarValue").text(Math.floor(progress)+"%");
}


function attractNodes() {
	for (var i = 1; i < numNodes; i++) {
		var thisNode = nodesArray[i];
		var parent = nodesArray[i].parent;
		var scaleFactor = 2;


		if (thisNode) {
			var newTarget = {x:0, y:0};
			var targets = 0;	


			// IF A NODE
			if (thisNode.type == "node") {
				// ATTRACT TO ROOT
				newTarget.x += nodesArray[0].position.x;
				newTarget.y += nodesArray[0].position.y;
				targets++;

				// ATTRACT TO HOME POSITION
				newTarget.x += thisNode.homePosition.x * scaleFactor;
				newTarget.y += thisNode.homePosition.y * scaleFactor;
				targets+= scaleFactor;

				// ATTRACT TO PARENTS
				newTarget.x += thisNode.parent.position.x * 3;
				newTarget.y += thisNode.parent.position.y * 3;
				targets+=3;

				// ATTRACT TO CHILDREN
				for (var k = 0; k < thisNode.children.length; k++) {
					newTarget.x += thisNode.children[k].position.x;
					newTarget.y += thisNode.children[k].position.y;
					targets ++;
				}
			}
			

			// EVERYTHING ELSE
		
			// ATTRACT TO PARENTS
			newTarget.x += thisNode.parent.position.x * 4;
			newTarget.y += thisNode.parent.position.y * 4;
			targets+= 4;

			// ATTRACT TO COUSINS (PARENTS' SISTER'S CHILDREN)
			var grandparent = thisNode.parent.parent;
			for (var k=0; k < grandparent.children.length; k++) {
				var aunt = grandparent.children[k];
				if (grandparent.children[k].children) {
					for (var c = 0; c < grandparent.children[k].children.length; c++) {
						newTarget.x += grandparent.children[k].children[c].position.x;
						newTarget.y += grandparent.children[k].children[c].position.y;
						targets++;
					}
				}
			}

			// ATTRACT TO SISTERS 
			for (var k=0; k < parent.children.length; k++) {
				if (k != i) {
					var sister = parent.children[k];

					newTarget.x += sister.position.x * 3;
					newTarget.y += sister.position.y * 3;
					targets+= 3;
					
					// ATTRACT TO SISTERS' CHILDREN (NEICES)
					if (sister.type == "node") {
						for (var j=0; j< sister.children.length; j++) {
							var neice = sister.children[j];
							newTarget.x += neice.position.x * 4;
							newTarget.y += neice.position.y * 4;
							targets += 4;	

							// ATTRACT TO SISTERS' GRANDCHILDREN
							if (neice.type == "node") {
								for (var p=0; p<neice.children[p]; p++) {
									var grandNeice = neice.children[p];
									newTarget.x += grandNeice.position.x * 5;
									newTarget.y += grandNeice.position.y * 5;
									targets+=5;
								}
							}
						}
					}	
				}
			}

			// divide the new target by the total number of new positions added
			thisNode.targetPosition.x = newTarget.x / targets;
			thisNode.targetPosition.y = newTarget.y / targets;
		}
	}
}

function repelNodes() {
	for (var i = 1; i < numNodes; i++) {
		var thisNode = nodesArray[i];
		//If node is real and a leaf (internal nodes don't need to bounce)
		if (thisNode && thisNode.type == "leaf") {
			var newTarget = { x: thisNode.position.x, y: thisNode.position.y };

			//Now loop through all the other nodes
			for (var k = 1; k < numNodes; k++) {
				//Get that node`
				var otherNode = nodesArray[k];

				//If k is not i and othernode exists and is a leaf
				if (k != i && otherNode && otherNode.type == "leaf") {

					// get distance between the two nodes
					var dx = (thisNode.position.x - otherNode.position.x);
					var dy = (thisNode.position.y - otherNode.position.y);
					var distance = Math.abs(dx) + Math.abs(dy);

					var friction = 8; // this limits the effect size of the bounce function


					// at what level does thisNode and otherNode share a common ancestor?
					var commonAncestorIDLevel = 0;
					for (var n = 0; n < thisNode.ancestorIDs.length; n++) {
						if (thisNode.ancestorIDs[n] == otherNode.ancestorIDs[n]) {
							commonAncestorIDLevel = n;
						}
					}

					// set minDist according to the plate size of each node at its commonAncestorIDLevel
					var minDist = (thisNode.plateSizes[commonAncestorIDLevel] + otherNode.plateSizes[commonAncestorIDLevel]) + 25;

					// if they're only connected at a distant ancestor, add a small boost
					if ( commonAncestorIDLevel + 2 < thisNode.depth  ) {
						minDist *= 1.025;
					}

					if ( commonAncestorIDLevel + 2 < otherNode.depth  ) {
						minDist *= 1.025;
					}

					///////////////// if they're too close, bounce away
                	if (distance < minDist) {
	                    var avoidSpeed = (minDist-distance) * 0.5;
	                    var EangleInDegrees = Math.atan2(dy, dx);
	                    var Evx = avoidSpeed * Math.cos((EangleInDegrees));
	                    var Evy = avoidSpeed * Math.sin((EangleInDegrees));
	                    thisNode.velocity.x+=Evx;
	                    thisNode.velocity.y+=Evy;
                	}

					thisNode.velocity.x /= friction; 
		        	thisNode.velocity.y /= friction; 
		            
		            // then add the target position and any bounce effect
		            thisNode.position.x += (thisNode.velocity.x);
		            thisNode.position.y += (thisNode.velocity.y);

				}
			}
		}
	}
}




function moveNodesToTarget() {
	for (var i = 1; i < numNodes; i++) {
		nodesArray[i].position.x = ((nodesArray[i].position.x * dampening) + nodesArray[i].targetPosition.x) / (dampening+1);
		nodesArray[i].position.y = ((nodesArray[i].position.y * dampening) + nodesArray[i].targetPosition.y) / (dampening+1);
	}
}

function moveNodesAroundScreen() {
	for (var i = 1; i < numNodes; i++) {
		for (var k = 0; k<=maxAncestors; k++) {
			$("#topoNode_"+nodesArray[i].id+"_"+k).attr("cx",nodesArray[i].position.x);
			$("#topoNode_"+nodesArray[i].id+"_"+k).attr("cy",nodesArray[i].position.y);
			$("#topoLabel_"+nodesArray[i].id).attr("dx",nodesArray[i].position.x);
			$("#topoLabel_"+nodesArray[i].id).attr("dy",nodesArray[i].position.y-12);				
			$("#topoLabelBG_"+nodesArray[i].id).attr("cx",nodesArray[i].position.x);
			$("#topoLabelBG_"+nodesArray[i].id).attr("cy",nodesArray[i].position.y);
		}
		adjustLinkLines(i);					
	}
}


function moveTooltipsToFollowNodes() {
	// SELECTION MARKER PIN

	// get width of box
	if (currentlySelectedTopoNode !=0) {
		// move selection markers
		$(".selectionMarker").attr("transform","translate("+(nodesArray[currentlySelectedTopoNode].position.x)+", "+(nodesArray[currentlySelectedTopoNode].position.y - 80)+
					")")
	}

	// get width of box
	if (currentlySelected2TopoNode !=0) {
		// move selection markers
		$(".selectionMarker2").attr("transform","translate("+(nodesArray[currentlySelected2TopoNode].position.x)+", "+(nodesArray[currentlySelected2TopoNode].position.y - 80)+
					")")
	}

	// MOUSE OVER TOOLTIP PIN
	// move tooltips
	if (mouseOverTopoNode) {
		$(".d3-tip").attr("transform","translate("+(nodesArray[mouseOverTopoNode].position.x )+", "+(nodesArray[mouseOverTopoNode].position.y - 80)+
					")")
	}
}


function adjustLinkLines(i) {
	if (nodesArray[i].position && nodesArray[i].parent.position) {
		$("#link"+i).attr("x1", nodesArray[i].position.x);
		$("#link"+i).attr("y1", nodesArray[i].position.y);
		$("#link"+i).attr("x2", nodesArray[i].parent.position.x);
		$("#link"+i).attr("y2", nodesArray[i].parent.position.y);
	}
}


var mouseDown = 0;
var lockMouseOverTopoNode = 0;
document.body.onmousedown = function() { 
    mouseDown = 1;
    lockMouseOverTopoNode = mouseOverTopoNode;
}
document.body.onmouseup = function() {
    mouseDown = 0;
    lockMouseOverTopoNode = 0;
}


// This enables d3 mouse wheel zoom & drag
var zoom = d3.behavior.zoom()
    .scaleExtent([0.1, 5])
    .on("zoom", zoomed);


// This code allows the user to drag nodes around the screen
var drag = d3.behavior.drag()
	.on("drag", function () {
		if(mouseDown == 1) {	
			var node = getNodeByID(lockMouseOverTopoNode, nodes);
			var coordinates = [0, 0];
			coordinates = d3.mouse(this);
			var x = coordinates[0];
			var y = coordinates[1];
			node.position.x = x;
			node.position.y = y;
			node.targetPosition.x = x;
			node.targetPosition.y = y;

			// pause force layout if it's not already paused
			if (forceLayoutCurrentlyRunning) {
				pauseForceLayout();
			}

			moveNodesAroundScreen();
			moveTooltipsToFollowNodes();
		}

	});


function zoomed() {
	var translate = d3.event.translate;
	var scale = d3.event.scale;
	//console.log(translate,scale);

	if (mouseOverTopoNode == undefined) {
	  svgTopoMapContainer.attr("transform", "translate(" + translate + ")scale(" + scale + ")");
	}
}

function zoomIn() {
	zoom.scale(zoom.scale()*1.1);
	var translate = zoom.translate();
	var scale = zoom.scale();	
	  svgTopoMapContainer.attr("transform", "translate(" + translate + ")scale(" + scale + ")");
}

function zoomOut() {
	zoom.scale(zoom.scale()/1.1);
	var translate = zoom.translate();
	var scale = zoom.scale();	
	  svgTopoMapContainer.attr("transform", "translate(" + translate + ")scale(" + scale + ")");
}

function centerCanvas() {
	// get min and max x,y values of all the nodes 
	var minX = 9999999999;
	var maxX = -9999999999;
	var minY = 9999999999;
	var maxY = -9999999999;
	for (var i = 0; i < nodesArray.length; i++) {
		if (nodesArray[i].position.x < minX) { minX = nodesArray[i].position.x }
		if (nodesArray[i].position.x > maxX) { maxX = nodesArray[i].position.x }
		if (nodesArray[i].position.y < minY) { minY = nodesArray[i].position.y }
		if (nodesArray[i].position.y > maxY) { maxY = nodesArray[i].position.y }
	}

	// get size of current window
	var actualWidth = maxX-minX;
	var actualHeight = maxY-minY;

	var scaleFactor = chartWidth / actualWidth / 2;


	console.log(actualWidth, actualHeight);
	console.log(chartWidth, chartHeight);
	console.log(scaleFactor);

	// map distribution to current window

	// adjust scale and transform settings
	zoom.scale(scaleFactor);
	if (scaleFactor < 1) {
		zoom.translate([chartWidth/(2), chartHeight/(2)]);
	}
	else {
		zoom.translate([-chartWidth/scaleFactor/2, -chartHeight/scaleFactor/2]);
	}

	var translate = zoom.translate();
	var scale = zoom.scale();	
	console.log("transform", "translate(" + translate + ")scale(" + scale + ")");

	svgTopoMapContainer.attr("transform", "translate(" + translate + ")scale(" + scale + ")");

}

function getNodeByID(int, data) {
	for (var i = 0; i < numNodes; i++) {
		if(nodesArray[i].id === int) {
			return nodesArray[i];
		}
	}
}

function drawLegend() {
	var legend = d3.select("#topographicMapLegend")
             .append("svg")
             .attr("width", maxAncestors * 20 + 50)
             .attr("height", 20);

    	legend.append("text")
    	    .text("Depth")
    	    .attr("x", 0)
    	    .attr("y", 14)
    	    .attr("font-family", "sans-serif")
    	    .attr("font-size", "12px")
			.attr("fill", "black");

    for (var i = 1; i <= maxAncestors; i++) {
    	legend.append("circle")
    		.attr("cx", 20 * i + 30)
    		.attr("cy", 10)
    		.attr("r", 10)
    		.style("fill", colours(i))
    		.attr("initialColor", colours(i))
    		.attr("id","legendPlate_"+i);

    	legend.append("text")
    	    .text( i )
    	    .attr("x", 20 * i + 30)
    	    .attr("y", 14)
    	    .attr("text-anchor","middle")
    	    .attr("font-family", "sans-serif")
    	    .attr("font-size", "12px")
			.attr("fill", "black");

    }

}


function pauseForceLayout() {
	clearInterval(tick); 
	forceLayoutCurrentlyRunning=false; 
	$('#pauseButton').fadeOut('slow',function(){$('#restartButton').fadeIn('slow');});
	$("#calculatingPositionsMessage").hide();

}

function restartForceLayout() {
	forceLayout(nodes); 
	$('#restartButton').fadeOut('slow',function(){$('#pauseButton').fadeIn('slow');});
	counter = 0;
	$("#calculatingPositionsMessage").show();

}

function hideLinks() {
	$(".linkLine").css("visibility","hidden");
	$('#hideLinksButton').fadeOut('slow',function(){$('#showLinksButton').fadeIn('slow');});

}

function showLinks() {
	$(".linkLine").css("visibility","visible");
	$('#showLinksButton').fadeOut('slow',function(){$('#hideLinksButton').fadeIn('slow');});
}


function hideLabels() {
	$("#svgLabels").css("display","none");
	$('#hideLabelsButton').fadeOut('slow',function(){$('#showLabelsButton').fadeIn('slow');});

}

function showLabels() {
	$("#svgLabels").css("display","block");
	$('#showLabelsButton').fadeOut('slow',function(){$('#hideLabelsButton').fadeIn('slow');});
}
